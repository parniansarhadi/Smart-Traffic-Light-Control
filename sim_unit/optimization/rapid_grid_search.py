import argparse
import copy
import hashlib
import itertools
import json
import math
import os
import random
import subprocess
import sys
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

try:
    from ..utilities.json_utils import load_json as _load_json, write_json as _write_json
    from ..utilities.path_utils import get_workspace_root
except ImportError:
    _SIM_UNIT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if _SIM_UNIT_ROOT not in sys.path:
        sys.path.insert(0, _SIM_UNIT_ROOT)
    from utilities.json_utils import load_json as _load_json, write_json as _write_json
    from utilities.path_utils import get_workspace_root


STAGE_PRIORITY = "priority"
STAGE_ADAPTIVE = "adaptive"
STAGE_EV = "ev_preemption"
STAGE_META = "meta"
ALL_STAGES = [STAGE_PRIORITY, STAGE_ADAPTIVE, STAGE_EV, STAGE_META]
CACHE_VERSION = 4

# Goal Profiles: Define objective focus
GOAL_BALANCED = "balanced"
GOAL_ECO = "eco"
GOAL_THROUGHPUT = "throughput"
GOAL_EV = "ev_focus"
GOAL_PED = "ped_focus"
GOAL_FLUIDITY = "fluidity"
GOAL_CONGESTION = "low_congestion"
GOAL_VEH = "veh_focus"
GOAL_PED_VEH = "ped_veh_focus"
ALL_GOALS = [GOAL_BALANCED, GOAL_ECO, GOAL_THROUGHPUT, GOAL_EV, GOAL_PED, GOAL_FLUIDITY, GOAL_CONGESTION, GOAL_VEH, GOAL_PED_VEH]

GOAL_MULTIPLIERS = {
    GOAL_BALANCED: {},
    GOAL_ECO: {
        "total_co2": 25.0,
        "total_fuel": 15.0,
        "total_stops": 10.0,
        "avg_queue": 1.5,
        "all_v_avg": 0.5,
    },
    GOAL_THROUGHPUT: {
        "throughput": 25.0,
        "all_v_avg": 2.0,
        "avg_queue": 2.0,
        "time_loss": 2.0,
        "total_stops": 0.2,
    },
    GOAL_EV: {
        "ev_avg": 25.0,
        "ev_p95": 15.0,
        "force_switches": 2.0,
        "light_changes": 1.5,
    },
    GOAL_PED: {
        "ped_p95": 25.0,
        "p_avg": 20.0,
        "starvation_events": 3.0,
    },
    GOAL_FLUIDITY: {
        "total_stops": 15.0,
        "throughput": 15.0,
        "all_v_avg": 1.5,
        "avg_queue": 1.5,
        "time_loss": 1.5,
        "total_co2": 0.5,
    },
    "low_congestion": {
        "congestion_level": 25.0,
        "avg_queue": 5.0,
        "max_queue": 5.0,
        "lane_utilization": 3.0,
        "recovery_time_ratio": 2.0,
    },
    GOAL_VEH: {
        "all_v_avg": 25.0,
        "veh_p95": 10.0,
        "veh_p99": 5.0,
        "time_loss": 2.0,
        "avg_queue": 2.0,
    },
    GOAL_PED_VEH: {
        "ped_p95": 20.0,
        "p_avg": 18.0,
        "starvation_events": 3.0,
        "all_v_avg": 20.0,
        "veh_p95": 10.0,
        "veh_p99": 5.0,
        "time_loss": 2.0,
        "avg_queue": 2.0,
    }
}


SAFE_GUARD_BOUNDS = {
    "ev_preemption_policy": {
        "ev_max_hold_steps": (5, 45),
        "relief_window_steps": (2, 15),
        "relief_min_opposite_halting": (0, 12),
        "starvation_debt_trigger": (1.0, 60.0),
        "ped_max_red_steps": (10.0, 90.0),
        "min_green_time_preempt": (10, 60),
    },
    "dynamic_red_profile": {
        "base_red": (10.0, 60.0),
        "max_red_limit": (60.0, 150.0),
    },
    "adaptive_control": {
        "min_green_time": (30, 90),
        "max_green_time": (90, 240),
    },
    "no_preempt_policy": {
        "base_switch_cost": (5.0, 500.0),
        "queue_tolerance": (1.0, 40.0),
        "max_starvation_penalty": (0.0, 0.8),
    },
    "soft_priority_profile": {
        "emergency_base_weight": (80.0, 320.0),
        "emergency_urgent_weight": (120.0, 600.0),
        "ped_guard_threshold_s": (15.0, 70.0),
    },
    "ped_profile": {
        "ped_priority_threshold": (5.0, 60.0),
    },
    "adaptive_control.volume_profiles.high_traffic": {
        "base_switch_cost_mult": (1.0, 10.0),
        "green_active_bonus_mult": (1.0, 10.0),
        "max_starvation_penalty_mult": (0.01, 2.0),
    },
    "adaptive_control.volume_profiles.low_traffic": {
        "base_switch_cost_mult": (0.01, 2.0),
    },
}

def _norm_label(s):
    return str(s).lower().replace(' ', '_').replace('-', '_')


def _pct_change(new_val, baseline):
    if baseline <= 0:
        return 0.0
    return ((new_val - baseline) / baseline) * 100.0


def _ratio_or_value(value, baseline):
    if baseline <= 0:
        return float(value)
    return float(value) / float(baseline)


def _candidate_signature(mode, stage, profile, sim_time):
    payload = {
        "v": CACHE_VERSION,
        "mode": mode,
        "stage": stage,
        "profile": profile,
        "sim_time": sim_time,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha1(encoded).hexdigest()


def _metric_cache_key(ev_p95, ped_p95, starvation_events, total_co2):
    """Create cache key binned by metric ranges to catch similar results."""
    ev_bucket = int(round(ev_p95 / 3.0)) * 3
    ped_bucket = int(round(ped_p95 / 5.0)) * 5
    starv_bucket = int(starvation_events)
    co2_bucket = int(round(total_co2 / 500.0)) * 500
    return f"{ev_bucket}_{ped_bucket}_{starv_bucket}_{co2_bucket}"


def _score_key(row):
    return (
        not row.get("pass_constraints", False),
        row.get("objective_score", float("inf")),
        row.get("ev_p95", float("inf")),
        row.get("ped_p95", float("inf")),
        row.get("ev_avg", float("inf")),
        row.get("pt_avg", float("inf")),
        row.get("starvation_events", float("inf")),
    )


def _is_better(a, b):
    if b is None:
        return True
    return _score_key(a) < _score_key(b)


def _stage_objective_weights(stage, goal=GOAL_BALANCED):

    base_weights = {
        "all_v_avg": 5.0,
        "ev_avg": 2.5,
        "pt_avg": 2.0,
        "p_avg": 2.5,
        "ev_p95": 1.5,
        "ped_p95": 2.0,
        "starvation_events": 4.0,
        "total_co2": 3.0,
        "total_fuel": 1.5,
        "total_stops": 4.0,
        "avg_queue": 2.5,
        "time_loss": 1.5,
        "throughput": 5.0,
        "light_changes": 1.5,
        "force_switches": 2.0,
        "preemption_holds": 2.0,
        "fluidity_ratio": 4.0,
        "congestion_level": 3.0,
        "recovery_time_ratio": 3.0,
        "lane_utilization": 2.0,
        "queue_trend": 4.0,
        "delay_trend": 3.0,
        "slice_variance": 3.0
    }
    
    # Apply goal-specific multipliers
    multipliers = GOAL_MULTIPLIERS.get(goal, {})
    for k, m in multipliers.items():
        if k in base_weights:
            base_weights[k] *= m
            
    return base_weights


def _extract_metrics(row, baseline, args, stage=None):
    # Support both internal and dashboard-friendly keys
    ev = float(row.get("ev_p95") or row.get("P95 Delay Proxy (s)") or 0.0)
    ped = float(row.get("ped_p95") or row.get("ped_p95") or 0.0) # Placeholder if no ped p95 in dashboard
    ev_avg = float(row.get("ev_avg") or 0.0)
    pt_avg = float(row.get("pt_avg") or 0.0)
    all_v_avg = float(row.get("all_v_avg") or row.get("Average Delay (s)") or 0.0)
    p_avg = float(row.get("p_avg") or row.get("Average Delay (s)") or 0.0)
    starv = int(row.get("starvation_events") or row.get("Starvation Events") or 0)
    
    total_co2 = float(row.get("total_co2") or row.get("Total CO2 (g)") or 0.0)
    total_fuel = float(row.get("total_fuel") or row.get("Total Fuel (g)") or 0.0)
    total_stops = float(row.get("total_stops") or row.get("total_vehicle_stops") or row.get("Total Vehicle Stops") or 0.0)
    avg_queue = float(row.get("avg_queue") or row.get("Avg Queue Car") or row.get("Average Queue Length") or 0.0)
    time_loss = float(row.get("time_loss") or row.get("avg_time_loss") or 0.0)
    throughput = float(row.get("throughput") or row.get("Count") or 0.0)
    light_changes = int(row.get("light_changes") or row.get("NS Green->Red Changes") or row.get("ns_green_to_red_changes") or 0)
    force_switches = int(row.get("force_switches") or row.get("preemption_force_switches") or 0)
    
    congestion_level = float(row.get("congestion_level") or row.get("Avg Congestion Level") or 0.0)
    recovery_ratio = float(row.get("recovery_time_ratio") or row.get("Recovery Active Ratio") or 0.0)
    lane_util = float(row.get("lane_utilization") or row.get("Avg Lane Utilization") or 0.0)
    max_queue = float(row.get("max_queue") or row.get("MAX Queue Length") or row.get("Peak Total Queue") or 0.0)
    
    queue_trend = float(row.get("queue_trend") or row.get("Queue Trend") or 1.0)
    delay_trend = float(row.get("delay_trend") or row.get("Delay Trend") or 1.0)
    slice_variance = float(row.get("slice_variance") or row.get("Slice Variance") or 0.0)

    max_delay = float(row.get("max_delay") or row.get("Max Delay (s)") or 0.0)
    holds = float(row.get("holds") or row.get("preemption_holds") or 0.0)

    baseline_ev = float(baseline.get("ev_p95") or baseline.get("P95 Delay Proxy (s)") or 0.0)
    baseline_ped = float(baseline.get("ped_p95") or 0.0)
    baseline_ev_avg = float(baseline.get("ev_avg") or 0.0)
    baseline_pt_avg = float(baseline.get("pt_avg") or 0.0)
    baseline_all_v_avg = float(baseline.get("all_v_avg") or baseline.get("Average Delay (s)") or 0.0)
    baseline_p_avg = float(baseline.get("p_avg") or baseline.get("Average Delay (s)") or 0.0)
    baseline_starv = int(baseline.get("starvation_events") or baseline.get("Starvation Events") or 0)
    
    baseline_co2 = float(baseline.get("total_co2") or baseline.get("Total CO2 (g)") or 0.0)
    baseline_fuel = float(baseline.get("total_fuel") or baseline.get("Total Fuel (g)") or 0.0)
    baseline_stops = float(baseline.get("total_stops") or baseline.get("total_vehicle_stops") or baseline.get("Total Vehicle Stops") or 0.0)
    baseline_queue = float(baseline.get("avg_queue") or baseline.get("Avg Queue Car") or baseline.get("Average Queue Length") or 0.0)
    baseline_time_loss = float(baseline.get("time_loss") or baseline.get("avg_time_loss") or 0.0)
    baseline_throughput = float(baseline.get("throughput") or baseline.get("Count") or 0.0)
    
    baseline_light_changes = baseline.get("light_changes")
    if not baseline_light_changes:
        baseline_light_changes = baseline.get("ns_green_to_red_changes")
    baseline_light_changes = int(baseline_light_changes or 1)

    baseline_force_switches = baseline.get("force_switches")
    if not baseline_force_switches:
        baseline_force_switches = baseline.get("preemption_force_switches")
    baseline_force_switches = int(baseline_force_switches or 1)
    
    baseline_congestion = float(baseline.get("congestion_level") or baseline.get("Avg Congestion Level") or 0.0)
    baseline_recovery = float(baseline.get("recovery_time_ratio") or baseline.get("Recovery Active Ratio") or 0.0)
    baseline_lane_util = float(baseline.get("lane_utilization") or baseline.get("Avg Lane Utilization") or 0.0)
    baseline_max_queue = float(baseline.get("max_queue") or baseline.get("MAX Queue Length") or 0.0)
    baseline_holds = float(baseline.get("holds") or baseline.get("preemption_holds") or 0.0)

    ped_delta = _pct_change(ped, baseline_ped)
    ev_improved = ev < baseline_ev if baseline_ev > 0 else True
    ev_avg_ok = ev_avg <= baseline_ev_avg if baseline_ev_avg > 0 else True
    ped_ok = ped_delta <= args.max_ped_worsen_pct
    starv_ok = starv <= args.max_starvation
    
    # Patience Cap Guardrail
    patience_ok = max_delay <= args.patience_cap
    
    # Spillback Protection Guardrail
    spillback_ok = max_queue <= args.max_queue_cap
    
    # Trend Guardrail: Reject if traffic is worsening rapidly
    # 2 means the queue at the end is double what it was at the start.
    trend_ok = queue_trend <= getattr(args, "max_trend", 2.0)
    
    # Goal-Specific Strict Baseline Guardrails
    goal_focus = getattr(args, "goal", GOAL_BALANCED)
    if goal_focus == GOAL_ECO and baseline_co2 > 0:
        co2_ok = total_co2 < baseline_co2
    else:
        co2_ok = total_co2 <= baseline_co2 * 1.15 if baseline_co2 > 0 else True

    if goal_focus == "low_congestion" and baseline_congestion > 0:
        congestion_ok = congestion_level < baseline_congestion
    else:
        congestion_ok = congestion_level <= 0.8

    if goal_focus in (GOAL_PED, GOAL_PED_VEH) and baseline_p_avg > 0:
        ped_ok = p_avg < baseline_p_avg
    else:
        ped_ok = ped_delta <= args.max_ped_worsen_pct

    if goal_focus == GOAL_THROUGHPUT and baseline_throughput > 0:
        throughput_ok = throughput >= baseline_throughput
    else:
        throughput_ok = throughput >= baseline_throughput * 0.95 if baseline_throughput > 0 else True

    stops_ok = total_stops <= baseline_stops * 1.40 if baseline_stops > 0 else True
    queue_ok = avg_queue <= baseline_queue * 1.25 if baseline_queue > 0 else True
    switch_ok = force_switches <= baseline_force_switches * 2.0 if baseline_force_switches > 0 else True

    # Strict Starvation Guardrail
    if getattr(args, "strict_starvation", False) and starv > 0:
        starv_ok = False

    # Standard constraints
    is_valid = (ev_improved and ev_avg_ok and ped_ok and starv_ok and co2_ok and stops_ok and queue_ok and throughput_ok and switch_ok and patience_ok and spillback_ok and congestion_ok and trend_ok)

    weights = _stage_objective_weights(stage, goal=getattr(args, "goal", GOAL_BALANCED))
    
    throughput_ratio = baseline_throughput / throughput if throughput > 0 else 2.0
    holds_ratio = (baseline_holds + 1.0) / (holds + 1.0)
    current_fluidity = throughput / total_stops if total_stops > 0 else throughput
    baseline_fluidity = baseline_throughput / baseline_stops if baseline_stops > 0 else baseline_throughput
    fluidity_ratio = (baseline_fluidity + 0.1) / (current_fluidity + 0.1)

    objective_score = (
        weights["all_v_avg"] * _ratio_or_value(all_v_avg, baseline_all_v_avg)
        + weights["ev_avg"] * _ratio_or_value(ev_avg, baseline_ev_avg)
        + weights["pt_avg"] * _ratio_or_value(pt_avg, baseline_pt_avg)
        + weights["p_avg"] * _ratio_or_value(p_avg, baseline_p_avg)
        + weights["ev_p95"] * _ratio_or_value(ev, baseline_ev)
        + weights["ped_p95"] * _ratio_or_value(ped, baseline_ped)
        + weights["starvation_events"] * _ratio_or_value(starv, baseline_starv)
        + weights["total_co2"] * _ratio_or_value(total_co2, baseline_co2)
        + weights["total_fuel"] * _ratio_or_value(total_fuel, baseline_fuel)
        + weights["total_stops"] * _ratio_or_value(total_stops, baseline_stops)
        + weights["avg_queue"] * _ratio_or_value(avg_queue, baseline_queue)
        + weights["time_loss"] * _ratio_or_value(time_loss, baseline_time_loss)
        + weights["throughput"] * throughput_ratio
        + weights["light_changes"] * _ratio_or_value(light_changes, baseline_light_changes)
        + weights["force_switches"] * _ratio_or_value(force_switches, baseline_force_switches)
        + weights.get("preemption_holds", 0.0) * holds_ratio
        + weights.get("fluidity_ratio", 0.0) * fluidity_ratio
        + weights.get("congestion_level", 0.0) * _ratio_or_value(congestion_level, baseline_congestion)
        + weights.get("recovery_time_ratio", 0.0) * _ratio_or_value(recovery_ratio, baseline_recovery)
        + weights.get("lane_utilization", 0.0) * _ratio_or_value(lane_util, baseline_lane_util)
        + weights.get("queue_trend", 0.0) * queue_trend
        + weights.get("delay_trend", 0.0) * delay_trend
        + weights.get("slice_variance", 0.0) * slice_variance
    )

    return {
        "config": row.get("config", ""),
        "all_v_avg": all_v_avg,
        "ev_avg": ev_avg,
        "pt_avg": pt_avg,
        "p_avg": p_avg,
        "ev_p95": ev,
        "ped_p95": ped,
        "starvation_events": starv,
        "total_co2": total_co2,
        "total_fuel": total_fuel,
        "total_stops": total_stops,
        "avg_queue": avg_queue,
        "time_loss": time_loss,
        "throughput": throughput,
        "light_changes": light_changes,
        "force_switches": force_switches,
        "max_queue": max_queue,
        "max_delay": max_delay,
        "holds": holds,
        "ped_p95_delta_pct": ped_delta,
        "objective_score": objective_score,
        "all_v_avg_ratio": _ratio_or_value(all_v_avg, baseline_all_v_avg),
        "co2_ratio": _ratio_or_value(total_co2, baseline_co2),
        "patience_ok": patience_ok,
        "spillback_ok": spillback_ok,
        "congestion_ok": congestion_ok,
        "trend_ok": trend_ok,
        "pass_constraints": bool(ev_improved and ev_avg_ok and ped_ok and starv_ok and co2_ok and stops_ok and queue_ok and throughput_ok and switch_ok and patience_ok and spillback_ok and congestion_ok and trend_ok),
        "congestion_level": congestion_level,
        "recovery_time_ratio": recovery_ratio,
        "lane_utilization": lane_util,
        "queue_trend": queue_trend,
        "delay_trend": delay_trend,
        "slice_variance": slice_variance
    }


def _deep_update(target, source):
    for k, v in source.items():
        if isinstance(v, dict) and k in target and isinstance(target[k], dict):
            _deep_update(target[k], v)
        else:
            target[k] = v


def _apply_profile_to_config(config, profile):
    soft = profile.get("soft_priority_profile") or {}
    if soft:
        _deep_update(config.setdefault("adaptive_priority_policy", {}), soft)

    adaptive_old = profile.get("adaptive_no_preempt_profile") or {}
    if adaptive_old:
        _deep_update(config.setdefault("adaptive_control", {}).setdefault("no_preempt_policy", {}), adaptive_old)

    for section in ["adaptive_control", "ev_preemption_policy", "pedestrian_control", "dynamic_red_profile"]:
        data = profile.get(section)
        if data and isinstance(data, dict):
            if section == "dynamic_red_profile":
                _deep_update(config.setdefault("adaptive_control", {}).setdefault("dynamic_max_red", {}), data)
            else:
                _deep_update(config.setdefault(section, {}), data)

    preempt = profile.get("preemption_profile") or {}
    if preempt:
        _deep_update(config.setdefault("ev_preemption_policy", {}), preempt)

    ped = profile.get("ped_profile") or {}
    if "ped_priority_threshold" in ped:
        config.setdefault("pedestrian_control", {})["priority_threshold"] = float(ped["ped_priority_threshold"])


def _to_meta_candidate_payload(name, profile):
    payload = {"name": name}
    payload.update(profile)
    return payload


def _render_progress(completed, total, label="", width=36):
    if total <= 0:
        return
    ratio = min(max(completed / total, 0.0), 1.0)
    filled = int(width * ratio)
    bar = "#" * filled + "-" * (width - filled)
    percent = ratio * 100.0
    suffix = f" | {label}" if label else ""
    print(f"\r[progress] [{bar}] {completed}/{total} ({percent:5.1f}%){suffix}".ljust(85), end="", flush=True)
    if completed == total:
        print()


def _run_with_progress(cmd, cwd, total_runs):
    completed = 0
    active_label = "starting"
    seen_configs = set()
    _render_progress(completed, total_runs, active_label)
    output_log = []

    env = os.environ.copy()
    env["PYTHONPATH"] = cwd + (f":{env['PYTHONPATH']}" if "PYTHONPATH" in env else "")

    with subprocess.Popen(
        cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env
    ) as proc:
        assert proc.stdout is not None
        for raw_line in proc.stdout:
            output_log.append(raw_line)
            line = raw_line.rstrip("\n")
            if ">>> RUNNING:" in line:
                active_label = line.split(":", 1)[1].strip()
                if active_label not in seen_configs:
                    seen_configs.add(active_label)
                continue
            if "✅ Finished in" in line or "⚡ Loading" in line:
                completed += 1
                display_total = max(total_runs, completed)
                if len(seen_configs) > display_total:
                    display_total = len(seen_configs)
                _render_progress(completed, display_total, active_label)
                continue

        return_code = proc.wait()
        if return_code != 0:
            print()
            print("".join(output_log[-50:]))
            raise subprocess.CalledProcessError(return_code, cmd)


def _resolve_main_script(repo_root):
    candidates = [
        os.path.join(repo_root, "main.py"),
        os.path.join(repo_root, "sim_unit", "core", "main.py"),
        os.path.join(repo_root, "sim_unit", "main.py"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    raise FileNotFoundError(f"Could not locate simulation main.py. Checked: {candidates}")


def _run_main_with_meta_candidates(repo_root, mode, sim_time, real_traffic_source="synthetic", total_runs=6, benchmark_mode=False, optimize_config="adaptive_weighted_with_preempt"):
    main_script = _resolve_main_script(repo_root)
    cmd = [sys.executable, "-u", main_script, "--mode", mode, "--meta-candidates", "--meta-base-config", optimize_config, "--early-stop", "--sim-time", str(sim_time), "--include-configs", "fixed_no_preempt"]
    if mode == "real":
        cmd.extend(["--real-traffic-source", real_traffic_source])
    if benchmark_mode:
        cmd.append("--benchmark-mode")
    _run_with_progress(cmd, repo_root, total_runs)


def _load_latest_summary(repo_root):
    results_dir = os.path.join(repo_root, "sys_output", "dashboard_data")
    latest_path = os.path.join(results_dir, "latest.json")
    latest = _load_json(latest_path, default={})
    latest_folder = latest.get("latest_run_folder") or latest.get("latest_dir")
    
    if not latest_folder:
        # Fallback: look for the most recent directory manually
        if os.path.exists(results_dir):
            subdirs = [d for d in os.listdir(results_dir) if os.path.isdir(os.path.join(results_dir, d)) and d.isdigit()]
            if subdirs:
                latest_folder = sorted(subdirs)[-1]
    
    if not latest_folder:
        print("[warning] Could not locate latest dashboard output folder.")
        print("[tip] If you recently emptied 'sys_output', try clearing the cache: 'rm .rapid_grid_cache.json'")
        return []

    summary_path = os.path.join(results_dir, latest_folder, "summary.json")
    if not os.path.exists(summary_path):
        print(f"[warning] Summary not found at {summary_path}")
        return []
        
    print(f"[rapid] Loading results from: {latest_folder}")
    return _load_json(summary_path, default=[])


def _extract_baseline_from_summary(summary, baseline_name="fixed no preempt"):
    norm_target = _norm_label(baseline_name)
    combined = {}
    for r in summary:
        cfg = r.get("config") or r.get("Configuration") or ""
        if _norm_label(cfg) == norm_target:
            cat = r.get("Category") or r.get("User Class") or ""
            cat_lower = cat.lower()
            if "all" in cat_lower:
                combined.update(r)
                combined["all_v_avg"] = r.get("Average Delay (s)", 0.0)
                combined["veh_p95"] = r.get("P95 Delay Proxy (s)", 0.0)
            elif "vehicle" in cat_lower and "emergency" not in cat_lower:
                combined["v_avg"] = r.get("Average Delay (s)", 0.0)
                combined["reg_v_p95"] = r.get("P95 Delay Proxy (s)", 0.0)
            elif "emergency" in cat_lower:
                combined["ev_avg"] = r.get("Average Delay (s)", 0.0)
                combined["ev_p95"] = r.get("P95 Delay Proxy (s)", 0.0)
            elif "pedestrian" in cat_lower:
                combined["p_avg"] = r.get("Average Delay (s)", 0.0)
                combined["ped_p95"] = r.get("P95 Delay Proxy (s)", 0.0)
            elif "pt" in cat_lower or "bus" in cat_lower:
                combined["pt_avg"] = r.get("Average Delay (s)", 0.0)
                combined["pt_p95"] = r.get("P95 Delay Proxy (s)", 0.0)
    if combined:
        return combined
    return summary[0] if summary else {}


def _cluster_candidates(candidates, rng, max_clusters=None):
    """
    Enforce diversity: cluster candidates and pick representatives.
    This avoids evaluating highly similar configs.
    """
    if not candidates or len(candidates) <= 1:
        return candidates
    
    if max_clusters is None:
        # Keep ~60% of candidates to enforce diversity
        max_clusters = max(1, int(len(candidates) * 0.6))
    
    if len(candidates) <= max_clusters:
        return candidates
    
    def flatten(d):
        items = {}
        for k, v in d.items():
            if isinstance(v, dict):
                for sub_k, sub_v in flatten(v).items():
                    items[f"{k}.{sub_k}"] = sub_v
            else:
                items[k] = v
        return items
    
    def _profile_distance(p1, p2):
            """Calculate normalized numeric distance between two profiles."""
            flat1 = flatten(p1)
            flat2 = flatten(p2)
            dist = 0.0
            keys = set(flat1.keys()).union(flat2.keys())
            if not keys:
                return 0.0
            
            for k in keys:
                v1 = flat1.get(k)
                v2 = flat2.get(k)
                if isinstance(v1, (int, float)) and isinstance(v2, (int, float)) and not isinstance(v1, bool) and not isinstance(v2, bool):
                    max_val = max(abs(v1), abs(v2))
                    if max_val > 0:
                        dist += abs(v1 - v2) / max_val
                elif v1 != v2:
                    dist += 1.0  # Penalty for mismatch
                    
            return dist / len(keys) # Average distance per parameter
    
    # Greedy clustering: pick the ones that are far from each other
    selected = [candidates[0]]
    for c in candidates[1:]:
        if len(selected) >= max_clusters:
            break
        # Check distance to nearest selected
        min_dist = min(_profile_distance(c["profile"], s["profile"]) for s in selected)
        if min_dist > 0.05:  # At least 5% average difference across all parameters
            selected.append(c)
    
    while len(selected) < max_clusters and len(candidates) > len(selected):
        candidates_copy = [c for c in candidates if c not in selected]
        if not candidates_copy:
            break
        selected.append(rng.choice(candidates_copy))
    
    return selected


def _perturb_numeric(value, lower, upper, rng, is_int=False, strength=0.12):
    
    lower = float(lower)
    upper = float(upper)
    if upper < lower:
        lower, upper = upper, lower

    base = float(value)
    span = max(upper - lower, 1.0)
    std_dev = max(span * strength, 1.0 if is_int else 0.05)

    for _ in range(15):
        candidate = _clip(rng.gauss(base, std_dev), lower, upper)
        if is_int:
            candidate = int(round(candidate))
            if candidate != int(round(base)):
                return candidate
        elif abs(candidate - base) > 1e-5:
            return float(candidate)

    if is_int:
        current = int(round(base))
        return int(_clip(current + (1 if current < upper else -1), lower, upper))
    return float(_clip(base + (0.1 if base < upper else -0.1), lower, upper))


def _perturb_profile(profile, stage, rng):
    """Create a local perturbation around a survivor profile for phase-2 search."""
    perturbed = copy.deepcopy(profile)

    if stage == STAGE_PRIORITY:
        soft = perturbed.setdefault("soft_priority_profile", {})
        if "emergency_base_weight" in soft:
            soft["emergency_base_weight"] = _perturb_numeric(soft["emergency_base_weight"], 50.0, 500.0, rng)
        if "emergency_urgent_weight" in soft:
            soft["emergency_urgent_weight"] = _perturb_numeric(soft["emergency_urgent_weight"], 100.0, 1200.0, rng)
        if "bus_weight_normal" in soft:
            soft["bus_weight_normal"] = _perturb_numeric(soft["bus_weight_normal"], 0.0, 120.0, rng)
        if "ped_guard_threshold_s" in soft:
            soft["ped_guard_threshold_s"] = _perturb_numeric(soft["ped_guard_threshold_s"], 5.0, 120.0, rng)

    elif stage == STAGE_ADAPTIVE:
        adaptive = perturbed.setdefault("adaptive_no_preempt_profile", {})
        if "base_switch_cost" in adaptive:
            adaptive["base_switch_cost"] = _perturb_numeric(adaptive["base_switch_cost"], 20.0, 300.0, rng, strength=0.1)
        if "green_active_bonus" in adaptive:
            adaptive["green_active_bonus"] = _perturb_numeric(adaptive["green_active_bonus"], 0.0, 120.0, rng, strength=0.1)
        if "queue_tolerance" in adaptive:
            adaptive["queue_tolerance"] = _perturb_numeric(adaptive["queue_tolerance"], 1.0, 120.0, rng)
        if "max_starvation_penalty" in adaptive:
            adaptive["max_starvation_penalty"] = _perturb_numeric(adaptive["max_starvation_penalty"], 0.0, 2.0, rng)
            
        # Add Dynamic Red Profile perturbation to Adaptive stage
        dyn = perturbed.setdefault("dynamic_red_profile", {})
        if "base_red" in dyn:
            dyn["base_red"] = _perturb_numeric(dyn["base_red"], 5.0, 100.0, rng)
        if "max_red_limit" in dyn:
            dyn["max_red_limit"] = _perturb_numeric(dyn["max_red_limit"], 30.0, 240.0, rng)
        if "max_congestion_vehicles" in dyn:
            dyn["max_congestion_vehicles"] = _perturb_numeric(dyn["max_congestion_vehicles"], 5, 50, rng, is_int=True)

        # Add Volume Profile perturbation
        vp = perturbed.setdefault("adaptive_control", {}).setdefault("volume_profiles", {}).setdefault("high_traffic", {})
        if "base_switch_cost_mult" in vp:
            vp["base_switch_cost_mult"] = _perturb_numeric(vp.get("base_switch_cost_mult", 2.0), 1.0, 10.0, rng)

    elif stage == STAGE_EV:
        ev = perturbed.setdefault("preemption_profile", {})
        if "ev_max_hold_steps" in ev:
            ev["ev_max_hold_steps"] = _perturb_numeric(ev["ev_max_hold_steps"], 5, 200, rng, is_int=True)
        if "relief_window_steps" in ev:
            ev["relief_window_steps"] = _perturb_numeric(ev["relief_window_steps"], 2, 40, rng, is_int=True)
        if "relief_min_opposite_halting" in ev:
            ev["relief_min_opposite_halting"] = _perturb_numeric(ev["relief_min_opposite_halting"], 0, 40, rng, is_int=True)
        if "starvation_debt_gain_per_step" in ev:
            ev["starvation_debt_gain_per_step"] = _perturb_numeric(ev["starvation_debt_gain_per_step"], 0.1, 5.0, rng)
        if "starvation_debt_decay_per_step" in ev:
            ev["starvation_debt_decay_per_step"] = _perturb_numeric(ev["starvation_debt_decay_per_step"], 0.1, 5.0, rng)
        if "starvation_debt_trigger" in ev:
            ev["starvation_debt_trigger"] = _perturb_numeric(ev["starvation_debt_trigger"], 1.0, 200.0, rng)
        if "ped_max_red_steps" in ev:
            ev["ped_max_red_steps"] = _perturb_numeric(ev["ped_max_red_steps"], 10.0, 300.0, rng)

    elif stage == STAGE_META:
        knobs = _meta_knob_defs()
        for kd in knobs.values():
            section = kd["source"]
            key = kd["key"]
            if key not in perturbed.get(section, {}):
                continue
            is_int = kd["type"] == "int"
            perturbed[section][key] = _perturb_numeric(
                perturbed[section][key], kd["min"], kd["max"], rng, is_int=is_int
            )

    return perturbed


def _prefilter_candidates(candidates, args):
    """
    Pre-filter candidates that are likely to violate constraints.
    This is a heuristic to avoid expensive simulations.
    """
    filtered = []
    for c in candidates:
        profile = c.get("profile", {})
        risk_score = 0
        
        # Evaluate EV Preemption risks
        ev = profile.get("preemption_profile", {})
        if ev.get("ev_max_hold_steps", 0) > 100:
            risk_score += 1
        if ev.get("starvation_debt_trigger", 0) > 100.0:
            risk_score += 1
        if ev.get("ped_max_red_steps", 0) > 150.0:
            risk_score += 1
            
        # Evaluate Soft Priority risks
        soft = profile.get("soft_priority_profile", {})
        if soft.get("emergency_base_weight", 0) > 400.0:
            risk_score += 1
        if soft.get("emergency_urgent_weight", 0) > 800.0:
            risk_score += 1
            
        # Evaluate Dynamic/Adaptive risks
        dyn = profile.get("dynamic_red_profile", {})
        if dyn.get("base_red", 0) > 200.0:
            risk_score += 2  
        
        if risk_score >= 3:
           continue
        
        filtered.append(c)
    
    # Safety net: Always keep at least 30% of the pool to avoid over-filtering
    if len(filtered) < max(1, len(candidates) // 3):
        return candidates
    
    return filtered


def _is_similar_profile(p1, p2, tolerance=0.05):
    """
    Check if two configuration profiles are numerically similar.
    Returns True if all numeric parameters are within the given tolerance.
    """
    def flatten(d):
        items = {}
        for k, v in d.items():
            if isinstance(v, dict):
                for sub_k, sub_v in flatten(v).items():
                    items[f"{k}.{sub_k}"] = sub_v
            else:
                items[k] = v
        return items

    flat1 = flatten(p1)
    flat2 = flatten(p2)

    if set(flat1.keys()) != set(flat2.keys()):
        return False

    for k, v1 in flat1.items():
        v2 = flat2.get(k)
        if isinstance(v1, (int, float)) and isinstance(v2, (int, float)) and not isinstance(v1, bool) and not isinstance(v2, bool):
            max_val = max(abs(v1), abs(v2))
            if max_val > 0 and abs(v1 - v2) / max_val > tolerance:
                return False
        
        elif v1 != v2:
            return False
    return True


def _evaluate_candidates_batch(args, repo_root, opt_config_path, base_config, candidates, cache_state, sim_time):
    to_run = []
    evaluated = []
    metric_cache = cache_state.setdefault("metric_cache", {})

    batch_baseline = cache_state.get("baseline", {}).get(str(sim_time))
    if not batch_baseline:
        print(f"[rapid] Baseline for {sim_time}s not found in cache. Forcing a baseline run...")
        main_script = _resolve_main_script(repo_root)
        cmd = [sys.executable, "-u", main_script, "--mode", args.mode, "--early-stop", "--sim-time", str(sim_time), "--include-configs", "fixed_no_preempt"]
        if args.mode == "real":
            cmd.extend(["--real-traffic-source", getattr(args, "real_traffic_source", "synthetic")])
        if getattr(args, "benchmark_mode", False):
            cmd.append("--benchmark-mode")
        _run_with_progress(cmd, repo_root, 1)
        summary = _load_latest_summary(repo_root)
        if summary:
            batch_baseline = _extract_baseline_from_summary(
                summary, 
                baseline_name=getattr(args, "baseline_name", "fixed no preempt")
            )
            if batch_baseline:
                cache_state.setdefault("baseline", {})[str(sim_time)] = batch_baseline

    for c in candidates:
        sig = c["signature"]
        
        # Check exact signature cache first
        cached = cache_state["results"].get(sig)
        if cached:
            raw_metrics = dict(cached["metrics"])
            if batch_baseline:
                fresh = _extract_metrics(raw_metrics, batch_baseline, args, stage=c["stage"])
                raw_metrics.update(fresh)
            row = dict(raw_metrics)
            row.update({"stage": c["stage"], "name": c["name"], "signature": sig, "profile": c["profile"], "sim_time": cached.get("sim_time", sim_time)})
            evaluated.append(row)
            continue
        
        # Check for a similar profile in the cache 
        found_similar = False
        for cached_sig, cached_data in cache_state["results"].items():
            if cached_data.get("stage") == c["stage"] and cached_data.get("sim_time") == sim_time:
                if _is_similar_profile(c["profile"], cached_data.get("profile", {})):
                    raw_metrics = dict(cached_data["metrics"])
                    if batch_baseline:
                        fresh = _extract_metrics(raw_metrics, batch_baseline, args, stage=c["stage"])
                        raw_metrics.update(fresh)
                    row = dict(raw_metrics)
                    row.update({"stage": c["stage"], "name": c["name"], "signature": sig, "profile": c["profile"], "sim_time": sim_time})
                    evaluated.append(row)
                    
                    # Map this new signature to the same metrics
                    cache_state["results"][sig] = {
                        "stage": c["stage"],
                        "name": c["name"],
                        "profile": c["profile"],
                        "metrics": cached_data["metrics"],
                        "sim_time": sim_time,
                        "updated_at": datetime.now().isoformat(),
                    }
                    found_similar = True
                    break
        
        if found_similar:
            continue

        to_run.append(c)

    if not to_run:
        return batch_baseline, evaluated, 0


    run_config = _load_json(opt_config_path, default={})
    run_config["meta_tuning_candidates"] = [_to_meta_candidate_payload(c["name"], c["profile"]) for c in to_run]
    _write_json(opt_config_path, run_config)

    start = time.time()
    total_runs = 1 + len(to_run)
    _run_main_with_meta_candidates(
        repo_root,
        args.mode,
        sim_time,
        getattr(args, "real_traffic_source", "synthetic"),
        total_runs,
        benchmark_mode=getattr(args, "benchmark_mode", False),
        optimize_config=getattr(args, "optimize_config", "adaptive_weighted_with_preempt")
    )
    elapsed = time.time() - start

    summary = _load_latest_summary(repo_root)
    # Map summary entries by all possible normalized name variations, combining all category rows
    row_map = {}
    for r in summary:
        cfg = r.get("config") or r.get("Configuration") or ""
        if not cfg: continue
        norm = _norm_label(cfg)
        if norm not in row_map:
            row_map[norm] = {}
            row_map[norm.replace('_', ' ')] = row_map[norm]
        
        cat = r.get("Category") or r.get("User Class") or ""
        cat_lower = cat.lower()
        if "all" in cat_lower:
            row_map[norm].update(r)
            row_map[norm]["all_v_avg"] = r.get("Average Delay (s)", 0.0)
            row_map[norm]["veh_p95"] = r.get("P95 Delay Proxy (s)", 0.0)
        elif "vehicle" in cat_lower and "emergency" not in cat_lower:
            row_map[norm]["v_avg"] = r.get("Average Delay (s)", 0.0)
            row_map[norm]["reg_v_p95"] = r.get("P95 Delay Proxy (s)", 0.0)
        elif "emergency" in cat_lower:
            row_map[norm]["ev_avg"] = r.get("Average Delay (s)", 0.0)
            row_map[norm]["ev_p95"] = r.get("P95 Delay Proxy (s)", 0.0)
        elif "pedestrian" in cat_lower:
            row_map[norm]["p_avg"] = r.get("Average Delay (s)", 0.0)
            row_map[norm]["ped_p95"] = r.get("P95 Delay Proxy (s)", 0.0)
        elif "pt" in cat_lower or "bus" in cat_lower:
            row_map[norm]["pt_avg"] = r.get("Average Delay (s)", 0.0)
            row_map[norm]["pt_p95"] = r.get("P95 Delay Proxy (s)", 0.0)

    batch_baseline = _extract_baseline_from_summary(summary, baseline_name=getattr(args, "baseline_name", "fixed no preempt"))

    if batch_baseline:
        cache_state.setdefault("baseline", {})[str(sim_time)] = batch_baseline

    # Recalculate objective scores for already cached items in this batch
    for i in range(len(evaluated)):
        src = evaluated[i]
        recalc = _extract_metrics(src, batch_baseline, args, stage=src["stage"])
        evaluated[i].update(recalc)

    for c in to_run:
        src = None
        c_norm = _norm_label(c["name"])
        stage_norm = _norm_label(c["stage"])
        
        search_keys = [
            f"{stage_norm}_meta_{c_norm}",
            c_norm,
            f"adaptive_meta_{c_norm}",
            f"adaptive_meta_{stage_norm}_{c_norm}"
        ]
        
        for key in search_keys:
            if key in row_map:
                src = row_map[key]
                break
        
        if not src:
            clean_name = c_norm.replace('_', ' ')
            for cfg_norm, row_data in row_map.items():
                if clean_name in cfg_norm.replace('_', ' '):
                    src = row_data
                    break
        
        if not src:
            continue
            
        metrics = _extract_metrics(src, batch_baseline, args, stage=c["stage"])
        record = {
            "stage": c["stage"],
            "name": c["name"],
            "signature": c["signature"],
            "profile": c["profile"],
            "sim_time": sim_time,
        }
        record.update(metrics)
        evaluated.append(record)
        cache_state["results"][c["signature"]] = {
            "stage": c["stage"],
            "name": c["name"],
            "profile": c["profile"],
            "metrics": metrics,
            "sim_time": sim_time,
            "updated_at": datetime.now().isoformat(),
        }
        
        metric_key = _metric_cache_key(metrics["ev_p95"], metrics["ped_p95"], metrics["starvation_events"], metrics["total_co2"])
        metric_cache[metric_key] = metrics

    return batch_baseline, evaluated, elapsed


def _clip(value, lower, upper):
    return max(lower, min(upper, value))


def _clamp_value_to_bounds(value, lower, upper):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return value, False

    clamped = _clip(numeric, float(lower), float(upper))
    changed = abs(clamped - numeric) > 1e-9

    if isinstance(value, int) and not isinstance(value, bool):
        return int(round(clamped)), changed
    return float(clamped), changed


def _apply_safe_guard_to_profile(profile):
    changed_any = False
    guarded = copy.deepcopy(profile)

    for section, section_bounds in SAFE_GUARD_BOUNDS.items():
        section_data = guarded.get(section)
        if not isinstance(section_data, dict):
            continue

        for key, (lower, upper) in section_bounds.items():
            if key not in section_data:
                continue
            new_value, changed = _clamp_value_to_bounds(section_data[key], lower, upper)
            if changed:
                section_data[key] = new_value
                changed_any = True

    return guarded, changed_any


def _apply_safe_guard_to_candidates(candidates):
    guarded = []
    clamp_count = 0
    for c in candidates:
        profile, changed = _apply_safe_guard_to_profile(c.get("profile", {}))
        if changed:
            clamp_count += 1
        item = dict(c)
        item["profile"] = profile
        guarded.append(item)
    return guarded, clamp_count


def _stage_priority_candidates(args):
    out = []
    grid = itertools.product(
        args.emergency_base_weights,
        args.emergency_urgent_weights,
        args.bus_weights,
        args.bus_weight_stresses,
        args.ped_guard_thresholds,
    )
    for i, (base_w, urgent_w, bus_w, bus_stress_w, ped_guard) in enumerate(grid, start=1):
        profile = {
            "soft_priority_profile": {
                "emergency_base_weight": float(base_w),
                "emergency_urgent_weight": float(urgent_w),
                "bus_weight_normal": float(bus_w),
                "bus_weight_stress": float(bus_stress_w),
                "ped_guard_threshold_s": float(ped_guard),
            }
        }
        out.append({"stage": STAGE_PRIORITY, "name": f"priority_g{i:03d}", "profile": profile})
    return out


def _stage_adaptive_candidates(args):
    out = []
    grid = itertools.product(
        args.base_switch_costs,
        args.green_active_bonuses,
        args.queue_tolerances,
        args.max_starvation_penalties,
    )
    for i, (base_cost, green_bonus, queue_tol, starvation_penalty) in enumerate(grid, start=1):
        profile = {
            "adaptive_no_preempt_profile": {
                "base_switch_cost": float(base_cost),
                "green_active_bonus": float(green_bonus),
                "queue_tolerance": float(queue_tol),
                "max_starvation_penalty": float(starvation_penalty),
            }
        }
        out.append({"stage": STAGE_ADAPTIVE, "name": f"adaptive_g{i:03d}", "profile": profile})
    return out


def _stage_ev_candidates(args):
    out = []
    grid = itertools.product(
        args.ev_max_hold_steps,
        args.relief_window_steps,
        args.relief_min_opposite_halting,
        args.starvation_debt_gain_per_step,
        args.starvation_debt_decay_per_step,
        args.starvation_debt_trigger,
        args.ped_max_red_steps,
    )
    for i, values in enumerate(grid, start=1):
        (
            ev_max_hold,
            relief_window,
            relief_min_opposite,
            debt_gain,
            debt_decay,
            debt_trigger,
            ped_max_red,
        ) = values
        profile = {
            "preemption_profile": {
                "ev_max_hold_steps": int(ev_max_hold),
                "relief_window_steps": int(relief_window),
                "relief_min_opposite_halting": int(relief_min_opposite),
                "starvation_debt_gain_per_step": float(debt_gain),
                "starvation_debt_decay_per_step": float(debt_decay),
                "starvation_debt_trigger": float(debt_trigger),
                "ped_max_red_steps": float(ped_max_red),
                "ped_guard_enabled": True,
                "bounded_preemption_enabled": True,
            }
        }
        out.append({"stage": STAGE_EV, "name": f"ev_g{i:03d}", "profile": profile})
    return out


def _dedupe_candidates(mode, candidates, sim_time):
    seen = set()
    out = []
    for idx, c in enumerate(candidates, start=1):
        sig = _candidate_signature(mode, c["stage"], c["profile"], sim_time)
        if sig in seen:
            continue
        seen.add(sig)
        name = c["name"] or f"{c['stage']}_n{idx:04d}"
        out.append({
            "stage": c["stage"],
            "name": name,
            "profile": c["profile"],
            "signature": sig,
        })
    return out


def _sample_candidates_lhs(candidates_dict, stage_name, k, rng):

    candidates = candidates_dict.get(stage_name, [])
    if not candidates or k <= 0 or len(candidates) <= k:
        return list(candidates)
    
    indices = list(range(len(candidates)))
    if len(indices) > k:
        samples_per_stratum = max(1, len(indices) // k)
        selected_indices = []
        for i in range(0, len(indices), samples_per_stratum):
            stratum = indices[i : i + samples_per_stratum]
            if stratum:
                selected_indices.append(rng.choice(stratum))
        if len(selected_indices) > k:
            selected_indices = rng.sample(selected_indices, k)
        return [candidates[i] for i in selected_indices]
    
    return list(candidates)


class Tee(object):
    def __init__(self, filename, stream):
        self.file = open(filename, 'w', encoding='utf-8')
        self.stream = stream

    def write(self, data):
        try:
            self.stream.write(data)
            self.stream.flush()
        except Exception:
            pass
        try:
            self.file.write(data)
            self.file.flush()
        except Exception:
            pass

    def flush(self):
        try:
            self.stream.flush()
        except Exception:
            pass
        try:
            self.file.flush()
        except Exception:
            pass

def run_rapid_search(args):
    repo_root = get_workspace_root(__file__)
    logs_dir = os.path.join(repo_root, "sys_output", "logs")
    os.makedirs(logs_dir, exist_ok=True)
    safe_goal = str(getattr(args, 'goal', 'default')).replace(' ', '_')
    log_path = os.path.join(logs_dir, f"rapid_grid_search_console_{safe_goal}.txt")
    tee = Tee(log_path, sys.stdout)
    sys.stdout = tee
    sys.stderr = tee

    start_time = time.time()
    config_path = os.path.join(repo_root, "input_data", "sys_config", "system_param_config.json")
    opt_config_path = os.path.join(repo_root, "input_data", "sys_config", "optimization_config.json")
    report_dir = os.path.join(repo_root, "sys_output")
    os.makedirs(report_dir, exist_ok=True)
    cache_path = os.path.join(repo_root, ".rapid_grid_cache.json")
    if args.include_stages is not None:
        include = set(args.include_stages)
    else:
        # Automated Goal-Based Stage Mapping
        GOAL_STAGE_MAP = {
            GOAL_EV:         [STAGE_EV, STAGE_META],
            GOAL_PED:        [STAGE_PRIORITY, STAGE_META],
            GOAL_ECO:        [STAGE_PRIORITY, STAGE_ADAPTIVE, STAGE_META],
            GOAL_CONGESTION: [STAGE_PRIORITY, STAGE_ADAPTIVE, STAGE_META],
            GOAL_FLUIDITY:   [STAGE_PRIORITY, STAGE_ADAPTIVE, STAGE_META],
            GOAL_THROUGHPUT: [STAGE_PRIORITY, STAGE_ADAPTIVE, STAGE_META],
            GOAL_VEH:        [STAGE_PRIORITY, STAGE_ADAPTIVE, STAGE_META],
            GOAL_PED_VEH:    [STAGE_PRIORITY, STAGE_ADAPTIVE, STAGE_META],
            GOAL_BALANCED:   [STAGE_PRIORITY, STAGE_ADAPTIVE, STAGE_META]
        }
        include = set(GOAL_STAGE_MAP.get(args.goal, ALL_STAGES))
        print(f"[rapid] Goal '{args.goal}' selected. Automatically focusing search on stages: {list(include)}")

    include = {s for s in include if s in ALL_STAGES}
    include -= set(args.skip_stages)
    if not include:
        raise RuntimeError("No stages selected. Check --include-stages / --skip-stages.")

    rng = random.Random(args.seed)
    original_config = _load_json(config_path, default={})
    original_config.pop("meta_tuning_candidates", None)
    base_config = copy.deepcopy(original_config)

    cache_state = _load_json(cache_path, default={})
    if cache_state.get("version") != CACHE_VERSION:
        cache_state = {}
    cache_state["version"] = CACHE_VERSION
    cache_state.setdefault("baseline", {})
    cache_state.setdefault("results", {})
    cache_state.setdefault("metric_cache", {})

    all_evaluated = []
    final_baseline = None
    search_completed = False
    total_sim_time = 0.0

    try:
        print("[rapid] Building candidate pools (parallel)...")
        
        stage_candidates = {}
        
        def _build_stage(stage_name):
            if stage_name == STAGE_PRIORITY:
                return _stage_priority_candidates(args)
            elif stage_name == STAGE_ADAPTIVE:
                return _stage_adaptive_candidates(args)
            elif stage_name == STAGE_EV:
                return _stage_ev_candidates(args)
            return []
        
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {}
            for stage in [STAGE_PRIORITY, STAGE_ADAPTIVE, STAGE_EV]:
                if stage in include:
                    futures[stage] = executor.submit(_build_stage, stage)
            
            for stage, future in futures.items():
                stage_candidates[stage] = future.result()

        print(f"[rapid] Phase 1: Stratified sampling ({args.phase1_sim_time}s horizon)...")
        phase1_pool = []
        for stage in [STAGE_PRIORITY, STAGE_ADAPTIVE, STAGE_EV]:
            if stage in include:
                sampled = _sample_candidates_lhs(stage_candidates, stage, args.phase1_per_stage, rng)
                if args.enforce_diversity:
                    sampled = _cluster_candidates(sampled, rng, max_clusters=max(2, int(len(sampled) * 0.7)))
                phase1_pool.extend(sampled)

        if STAGE_META in include:
            meta_round1 = _build_meta_round_candidates(args, round_idx=1, center_profile={}, rng=rng)
            phase1_pool.extend(meta_round1[:args.phase1_meta_cap])

        if args.safe_guard:
            phase1_pool, clamped = _apply_safe_guard_to_candidates(phase1_pool)
            if clamped > 0:
                print(f"[rapid] Safe-guard clamped {clamped} phase-1 candidates to strict bounds.")

        phase1_pool = _dedupe_candidates(args.mode, phase1_pool, args.phase1_sim_time)
        
        if args.enable_prefilter:
            print("[rapid] Pre-filtering candidates...")
            original_len = len(phase1_pool)
            phase1_pool = _prefilter_candidates(phase1_pool, args)
            print(f"[rapid] Pre-filter: {original_len} -> {len(phase1_pool)} candidates")

        print(f"[rapid] Evaluating {len(phase1_pool)} phase 1 candidates ({args.phase1_sim_time}s)...")
        bline, phase1_rows, dt = _evaluate_candidates_batch(
            args,
            repo_root,
            opt_config_path,
            base_config,
            phase1_pool,
            cache_state,
            args.phase1_sim_time
        )
        if bline: final_baseline = bline
        total_sim_time += dt
        all_evaluated.extend(phase1_rows)

        if not all_evaluated:
            raise RuntimeError(
                f"No candidates were found in summary for the selected stages. "
                "Check if main.py is correctly writing summary.json and that candidate names match."
            )

        survivors = sorted(all_evaluated, key=_score_key)
        keep_n = max(1, int(math.ceil(len(survivors) * args.halving_keep_ratio)))
        survivors = survivors[:keep_n]

        print(f"[rapid] Phase 2: Refining {keep_n} survivors ({args.phase2_sim_time}s horizon)...")
        phase2_pool = []
        for s in survivors[: args.refine_seed_limit]:
            # Local refinement around best candidates
            for _ in range(args.refine_perturbations):
                pp = _perturb_profile(s["profile"], s["stage"], rng)
                phase2_pool.append({
                    "stage": s["stage"],
                    "name": f"{s['name']}_perturb",
                    "profile": pp,
                })

        if args.safe_guard and phase2_pool:
            phase2_pool, clamped = _apply_safe_guard_to_candidates(phase2_pool)
            if clamped > 0:
                print(f"[rapid] Safe-guard clamped {clamped} phase-2 candidates to strict bounds.")

        phase2_pool = _dedupe_candidates(args.mode, phase2_pool, args.phase2_sim_time)

        if phase2_pool and len(phase2_pool) <= args.max_phase2_candidates:
            bline, phase2_rows, dt = _evaluate_candidates_batch(
                args,
                repo_root,
                opt_config_path,
                base_config,
                phase2_pool,
                cache_state,
                args.phase2_sim_time
            )
            if bline: final_baseline = bline
            total_sim_time += dt
            all_evaluated.extend(phase2_rows)

        best = None
        max_sim_time_evaluated = max([r.get("sim_time", args.phase1_sim_time) for r in all_evaluated])
        for r in all_evaluated:
            if r.get("sim_time") == max_sim_time_evaluated:
                if _is_better(r, best):
                    best = r

        if not best:
            raise RuntimeError("Could not select best candidate.")

        final_config = copy.deepcopy(original_config)
        final_profile = best["profile"]
        if args.safe_guard:
            final_profile, _ = _apply_safe_guard_to_profile(final_profile)
        _apply_profile_to_config(final_config, final_profile)
        # Ensure the final system config is clean of candidates
        final_config.pop("meta_tuning_candidates", None)
        _write_json(config_path, final_config)

        # Update optimization_config.json with the results
        opt_data = _load_json(opt_config_path, default={})
        opt_data.setdefault("optimized_profiles_by_goal", {})
        opt_data["optimized_profiles_by_goal"][args.goal] = {
            "name": best["name"],
            "profile": final_profile,
            "timestamp": datetime.now().isoformat(),
            "base_config": getattr(args, "optimize_config", "adaptive_weighted_with_preempt")
        }
        opt_data["optimized_profile"] = opt_data["optimized_profiles_by_goal"][args.goal]
        _write_json(opt_config_path, opt_data)

        final_run_elapsed = 0.0
        if not args.skip_final_run:
            print("[rapid] Final Run: Running final simulation...")
            t0 = time.time()
            main_script = _resolve_main_script(repo_root)
            final_cmd = [sys.executable, "-u", main_script, "--mode", args.mode]
            if args.mode == "real":
                final_cmd.extend(["--real-traffic-source", getattr(args, "real_traffic_source", "synthetic")])
            if getattr(args, "benchmark_mode", False):
                final_cmd.append("--benchmark-mode")
            _run_with_progress(final_cmd, repo_root, 6)
            final_run_elapsed = time.time() - t0

            # Update latest.json with optimization metadata
            dashboard_root = os.path.join(repo_root, "sys_output", "dashboard_data")
            latest_json_path = os.path.join(dashboard_root, "latest.json")
            if os.path.exists(latest_json_path):
                try:
                    with open(latest_json_path, "r") as f:
                        latest_meta = json.load(f)
                    latest_meta["run_type"] = "single optimization"
                    latest_meta["optimization_goal"] = getattr(args, "goal", "balanced")
                    latest_meta["base_config_optimized"] = getattr(args, "optimize_config", "adaptive_weighted_with_preempt")
                    with open(latest_json_path, "w") as f:
                        json.dump(latest_meta, f, indent=4)
                except Exception as e:
                    print(f"[warning] Could not update latest.json metadata: {e}")

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = os.path.join(report_dir, f"rapid_grid_results_{stamp}.json")

        by_stage = {}
        for r in all_evaluated:
            by_stage.setdefault(r["stage"], []).append(r)
        stage_summary = {}
        for stage, rows in by_stage.items():
            stage_summary[stage] = {
                "evaluated": len(rows),
                "best": sorted(rows, key=_score_key)[0] if rows else None,
            }

        _write_json(
            report_path,
            {
                "mode": args.mode,
                "selected_stages": sorted(include),
                "baseline": final_baseline,
                "best_candidate": best,
                "applied_profile": best["profile"],
                "candidate_count": len(all_evaluated),
                "stage_summary": stage_summary,
                "timing_seconds": {
                    "search_runs": round(total_sim_time, 2),
                    "final_run": round(final_run_elapsed, 2),
                },
                "optimizations": {
                    "parallel_execution": True,
                    "metric_caching": True,
                    "constraint_prefiltering": args.enable_prefilter,
                    "lhs_sampling": True,
                    "diversity_enforcement": args.enforce_diversity,
                    "safe_guard": args.safe_guard,
                },
            },
        )

        search_completed = True

        _write_json(cache_path, cache_state)
        print(f"[rapid] Evaluated candidates: {len(all_evaluated)}")
        print(f"[rapid] Selected stage: {best['stage']}")
        print(f"[rapid] Selected config: {best['config']}")
        print(f"[rapid] Report: {report_path}")
    finally:
        if args.restore_original_config or not search_completed:
            _write_json(config_path, original_config)
        print(f"parameter tuning procedure complete. Total Time: {(time.time() - start_time) / 60:.1f}m")


def _meta_knob_defs():
    
    return {
        "soft.emergency_base_weight": {
            "source": "soft_priority_profile",
            "key": "emergency_base_weight",
            "type": "float",
            "delta": 20.0,
            "min": 50.0,
            "max": 500.0,
        },
        "soft.bus_weight_normal": {
            "source": "soft_priority_profile",
            "key": "bus_weight_normal",
            "type": "float",
            "delta": 2.0,
            "min": 0.0,
            "max": 100.0,
        },
        "adaptive.base_switch_cost": {
            "source": "no_preempt_policy", 
            "key": "base_switch_cost",
            "type": "float",
            "delta": 8.0,
            "min": 5.0,
            "max": 500.0,
        },
        "adaptive.min_green_time": {
            "source": "adaptive_control",
            "key": "min_green_time",
            "type": "float",
            "delta": 5.0,
            "min": 30.0,
            "max": 90.0,
        },
        "adaptive.max_green_time": {
            "source": "adaptive_control",
            "key": "max_green_time",
            "type": "float",
            "delta": 10.0,
            "min": 90.0,
            "max": 240.0,
        },
        "adaptive.queue_tolerance": {
            "source": "no_preempt_policy",
            "key": "queue_tolerance",
            "type": "float",
            "delta": 3.0,
            "min": 1.0,
            "max": 120.0,
        },
        "adaptive.dynamic_base_red": {
            "source": "dynamic_max_red",
            "key": "base_red",
            "type": "float",
            "delta": 5.0,
            "min": 10.0,
            "max": 90.0,
        },
        "adaptive.sigmoid_steepness": {
            "source": "no_preempt_policy",
            "key": "sigmoid_steepness",
            "type": "float",
            "delta": 0.1,
            "min": -1.0,
            "max": -0.1,
        },
        "adaptive.zero_waste_multiplier": {
            "source": "no_preempt_policy",
            "key": "zero_waste_multiplier",
            "type": "float",
            "delta": 0.01,
            "min": 0.0,
            "max": 0.1,
        },
        "preempt.min_green_time_preempt": {
            "source": "ev_preemption_policy",
            "key": "min_green_time_preempt",
            "type": "int",
            "delta": 5,
            "min": 5,
            "max": 60,
        },
        "preempt.queue_flush_factor": {
            "source": "ev_preemption_policy",
            "key": "queue_flush_factor",
            "type": "float",
            "delta": 1.0,
            "min": 1.0,
            "max": 20.0,
        },
        "priority.hard_streak_cap": {
            "source": "adaptive_priority_policy",
            "key": "hard_streak_cap",
            "type": "int",
            "delta": 1,
            "min": 1,
            "max": 10,
        },
        "priority.fairness_penalty": {
            "source": "soft_priority_profile",
            "key": "fairness_penalty",
            "type": "float",
            "delta": 20.0,
            "min": 0.0,
            "max": 500.0,
        },
        "adaptive.startup_stretch": {
            "source": "stretch_logic",
            "key": "startup_stretch",
            "type": "float",
            "delta": 2.0,
            "min": 0.0,
            "max": 20.0,
        },
        "ped.max_ped_phase_duration": {
            "source": "ped_profile",
            "key": "max_ped_phase_duration",
            "type": "int",
            "delta": 5,
            "min": 5,
            "max": 60,
        },
        "preempt.ev_max_hold_steps": {
            "source": "ev_preemption_policy",
            "key": "ev_max_hold_steps",
            "type": "int",
            "delta": 5.0,
            "min": 5,
            "max": 200,
        },
        "preempt.min_green_time_preempt": {
            "source": "ev_preemption_policy",
            "key": "min_green_time_preempt",
            "type": "float",
            "delta": 5.0,
            "min": 10.0,
            "max": 60.0,
        },
        "preempt.starvation_debt_trigger": {
            "source": "ev_preemption_policy",
            "key": "starvation_debt_trigger",
            "type": "float",
            "delta": 5.0,
            "min": 1.0,
            "max": 200.0,
        },
        "ped.ped_priority_threshold": {
            "source": "pedestrian_control",
            "key": "priority_threshold",
            "type": "float",
            "delta": 3.0,
            "min": 1.0,
            "max": 120.0,
        },
        "ped.cooldown": {
            "source": "pedestrian_control",
            "key": "cooldown",
            "type": "float",
            "delta": 10.0,
            "min": 10.0,
            "max": 300.0,
        },
        "adaptive.green_active_bonus": {
            "source": "no_preempt_policy",
            "key": "green_active_bonus",
            "type": "float",
            "delta": 5.0,
            "min": 5.0,
            "max": 100.0,
        },
        "adaptive.max_starvation_penalty": {
            "source": "no_preempt_policy",
            "key": "max_starvation_penalty",
            "type": "float",
            "delta": 0.1,
            "min": 0.0,
            "max": 0.9,
        },
        "preempt.ped_max_red_steps": {
            "source": "ev_preemption_policy",
            "key": "ped_max_red_steps",
            "type": "float",
            "delta": 10.0,
            "min": 30.0,
            "max": 180.0,
        },
        "dyn.base_red": {
            "source": "dynamic_red_profile",
            "key": "base_red",
            "type": "float",
            "delta": 10.0,
            "min": 10.0,
            "max": 90.0,
        },
        "high.switch_mult": {
            "source": "adaptive_control.volume_profiles.high_traffic",
            "key": "base_switch_cost_mult",
            "type": "float",
            "delta": 0.5,
            "min": 1.0,
            "max": 8.0,
        },
        "high.bonus_mult": {
            "source": "adaptive_control.volume_profiles.high_traffic",
            "key": "green_active_bonus_mult",
            "type": "float",
            "delta": 0.5,
            "min": 1.0,
            "max": 8.0,
        },
        "high.starv_mult": {
            "source": "adaptive_control.volume_profiles.high_traffic",
            "key": "max_starvation_penalty_mult",
            "type": "float",
            "delta": 0.1,
            "min": 0.1,
            "max": 2.0,
        },
        "low.switch_mult": {
            "source": "adaptive_control.volume_profiles.low_traffic",
            "key": "base_switch_cost_mult",
            "type": "float",
            "delta": 0.1,
            "min": 0.1,
            "max": 1.5,
        },
        "low.bonus_mult": {
            "source": "adaptive_control.volume_profiles.low_traffic",
            "key": "green_active_bonus_mult",
            "type": "float",
            "delta": 0.1,
            "min": 0.1,
            "max": 1.5,
        },
        "low.starv_mult": {
            "source": "adaptive_control.volume_profiles.low_traffic",
            "key": "max_starvation_penalty_mult",
            "type": "float",
            "delta": 0.1,
            "min": 0.1,
            "max": 1.5,
        },
    }


def _cast_value(kind, value):
    if kind == "int":
        return int(round(float(value)))
    return float(value)


def _get_profile_value(profile, knob):
    src = knob["source"]
    key = knob["key"]
    section = profile.get(src, {})
    if key in section:
        return section[key]
    return None


def _set_profile_value(profile, knob, value):
    src = knob["source"]
    key = knob["key"]
    parts = src.split('.')
    curr = profile
    for p in parts:
        curr = curr.setdefault(p, {})
    curr[key] = value


def _meta_round1_values(args):
    return {
        "soft.emergency_base_weight": list(args.meta_emergency_base_weights),
        "soft.bus_weight_normal": list(args.meta_bus_weight_normals),
        "adaptive.queue_tolerance": list(args.meta_queue_tolerances),
        "adaptive.min_green_time": list(args.meta_min_green_times),
        "adaptive.max_green_time": list(args.meta_max_green_times),
        "adaptive.dynamic_base_red": list(args.meta_dynamic_base_reds),
        "adaptive.sigmoid_steepness": list(args.meta_sigmoid_steepnesses),
        "adaptive.zero_waste_multiplier": list(args.meta_zero_waste_multipliers),
        "preempt.min_green_time_preempt": list(args.meta_min_green_time_preempts),
        "preempt.queue_flush_factor": list(args.meta_queue_flush_factors),
        "priority.hard_streak_cap": list(args.meta_hard_streak_caps),
        "priority.fairness_penalty": list(args.meta_fairness_penalties),
        "adaptive.startup_stretch": list(args.meta_startup_stretches),
        "ped.max_ped_phase_duration": list(args.meta_max_ped_phase_durations),
        "preempt.ev_max_hold_steps": list(args.meta_ev_max_hold_steps),
        "preempt.starvation_debt_trigger": list(args.meta_starvation_debt_triggers),
        "preempt.ped_max_red_steps": list(args.meta_ped_max_red_steps),
        "ped.ped_priority_threshold": list(args.meta_ped_priority_thresholds),
        "dyn.base_red": list(args.meta_dynamic_base_reds),
        "high.switch_mult": list(args.meta_high_switch_mults),
        "high.bonus_mult": list(args.meta_high_bonus_mults),
        "high.starv_mult": list(args.meta_high_starv_mults),
        "low.switch_mult": list(args.meta_low_switch_mults),
        "low.bonus_mult": list(args.meta_low_bonus_mults),
        "low.starv_mult": list(args.meta_low_starv_mults),
    }


def _build_meta_round_candidates(args, round_idx, center_profile, rng):
    knobs = _meta_knob_defs()
    active = [
        "soft.emergency_base_weight",
        "soft.bus_weight_normal",
        "adaptive.queue_tolerance",
        "adaptive.min_green_time",
        "adaptive.max_green_time",
        "adaptive.dynamic_base_red",
        "adaptive.sigmoid_steepness",
        "adaptive.zero_waste_multiplier",
        "preempt.min_green_time_preempt",
        "preempt.queue_flush_factor",
        "priority.hard_streak_cap",
        "priority.fairness_penalty",
        "adaptive.startup_stretch",
        "ped.max_ped_phase_duration",
        "preempt.ev_max_hold_steps",
        "preempt.starvation_debt_trigger",
        "preempt.ped_max_red_steps",
        "ped.ped_priority_threshold",
        "dyn.base_red",
        "high.switch_mult",
        "high.bonus_mult",
        "high.starv_mult",
        "low.switch_mult",
        "low.bonus_mult",
        "low.starv_mult",
    ]

    values_map = {}
    if round_idx == 1:
        values_map = _meta_round1_values(args)
    else:
        shrink = args.meta_narrowing_factor ** max(round_idx - 2, 0)
        for k in active:
            kd = knobs[k]
            center = _get_profile_value(center_profile, kd)
            if center is None:
                base_vals = _meta_round1_values(args)[k]
                center = base_vals[0]
            delta = float(kd["delta"]) * shrink
            low = _clip(float(center) - delta, float(kd["min"]), float(kd["max"]))
            high = _clip(float(center) + delta, float(kd["min"]), float(kd["max"]))
            vals = sorted({_cast_value(kd["type"], low), _cast_value(kd["type"], high)})
            values_map[k] = vals

    pool = []
    combos = itertools.product(*[values_map[k] for k in active])
    for idx, combo in enumerate(combos, start=1):
        profile = {}
        for k, v in zip(active, combo):
            _set_profile_value(profile, knobs[k], _cast_value(knobs[k]["type"], v))
        pool.append({"stage": STAGE_META, "name": f"meta_r{round_idx}_g{idx:03d}", "profile": profile})

    if args.meta_round_cap > 0 and len(pool) > args.meta_round_cap:
        pool = rng.sample(pool, args.meta_round_cap)
    return pool
def build_parser():
    parser = argparse.ArgumentParser(
        description="Rapid unified grid search: parallel execution, metric caching, pre-filtering, LHS sampling, diversity enforcement."
    )
    parser.add_argument("--mode", choices=["generic", "real"], default="generic")
    parser.add_argument("--real-traffic-source", choices=["stream", "synthetic"], default="synthetic", help="Traffic source when mode is real")
    parser.add_argument("--max-ped-worsen-pct", type=float, default=15.0)
    parser.add_argument("--max-starvation", type=int, default=2)

    parser.add_argument("--include-stages", nargs="+", default=None, choices=ALL_STAGES)
    parser.add_argument("--skip-stages", nargs="+", default=[], choices=ALL_STAGES)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--refresh-baseline", action="store_true")

    parser.add_argument("--phase1-sim-time", type=int, default=360, help="Simulation horizon for Phase 1 (coarse search)")
    parser.add_argument("--phase2-sim-time", type=int, default=720, help="Simulation horizon for Phase 2 (fine refinement)")
    parser.add_argument("--phase1-per-stage", type=int, default=18)
    parser.add_argument("--phase1-meta-cap", type=int, default=18)
    parser.add_argument("--halving-keep-ratio", type=float, default=0.35)
    parser.add_argument("--refine-seed-limit", type=int, default=8)
    parser.add_argument("--refine-perturbations", type=int, default=3)
    parser.add_argument("--max-phase2-candidates", type=int, default=40)

    parser.add_argument("--meta-stages", type=int, default=1)
    parser.add_argument("--meta-round-cap", type=int, default=16)
    parser.add_argument("--meta-narrowing-factor", type=float, default=0.6)
    parser.add_argument("--meta-min-improvement", type=float, default=0.5)

    parser.add_argument("--skip-final-run", action="store_true")
    parser.add_argument("--restore-original-config", action="store_true")
    parser.add_argument(
        "--safe-guard",
        action="store_true",
        help="Enable strict safety clamping for candidate profiles before evaluation.",
    )

    # Optimization control flags
    parser.add_argument("--disable-prefilter", action="store_false", dest="enable_prefilter", help="Disable constraint pre-filtering")
    parser.add_argument("--disable-diversity", action="store_false", dest="enforce_diversity", help="Disable candidate diversity via clustering")
    parser.set_defaults(enable_prefilter=True, enforce_diversity=True)

    # Stage pass-through knobs
    parser.add_argument("--emergency-base-weights", type=float, nargs="+", default=[150])
    parser.add_argument("--emergency-urgent-weights", type=float, nargs="+", default=[320])
    parser.add_argument("--bus-weights", type=float, nargs="+", default=[16, 17, 18, 19, 20])
    parser.add_argument("--bus-weight-stresses", type=float, nargs="+", default=[12, 13, 14, 15, 16])
    parser.add_argument("--ped-guard-thresholds", type=float, nargs="+", default=[54, 58])

    parser.add_argument("--base-switch-costs", type=float, nargs="+", default=[40, 50])
    parser.add_argument("--green-active-bonuses", type=float, nargs="+", default=[20, 25])
    parser.add_argument("--queue-tolerances", type=float, nargs="+", default=[10, 15])
    parser.add_argument("--max-starvation-penalties", type=float, nargs="+", default=[0.3, 0.5])

    parser.add_argument("--ev-max-hold-steps", type=int, nargs="+", default=[30, 40])
    parser.add_argument("--relief-window-steps", type=int, nargs="+", default=[6, 10])
    parser.add_argument("--relief-min-opposite-halting", type=int, nargs="+", default=[4, 8])
    parser.add_argument("--starvation-debt-gain-per-step", type=float, nargs="+", default=[0.8, 1.2])
    parser.add_argument("--starvation-debt-decay-per-step", type=float, nargs="+", default=[1.2, 1.8])
    parser.add_argument("--starvation-debt-trigger", type=float, nargs="+", default=[25.0, 35.0])
    parser.add_argument("--ped-max-red-steps", type=float, nargs="+", default=[70.0, 90.0])

    # Meta knob defaults
    parser.add_argument("--meta-emergency-base-weights", type=float, nargs="+", default=[180, 220])
    parser.add_argument("--meta-bus-weight-normals", type=float, nargs="+", default=[12])
    parser.add_argument("--meta-base-switch-costs", type=float, nargs="+", default=[45, 60])
    parser.add_argument("--meta-queue-tolerances", type=float, nargs="+", default=[15])
    parser.add_argument("--meta-ev-max-hold-steps", type=int, nargs="+", default=[30, 40])
    parser.add_argument("--meta-starvation-debt-triggers", type=float, nargs="+", default=[25.0, 35.0])
    parser.add_argument("--meta-ped-priority-thresholds", type=float, nargs="+", default=[20])
    parser.add_argument("--meta-dynamic-base-reds", type=float, nargs="+", default=[60])
    parser.add_argument("--meta-min-green-times", type=float, nargs="+", default=[30, 45])
    parser.add_argument("--meta-max-green-times", type=float, nargs="+", default=[90, 120])

    parser.add_argument("--meta-green-active-bonuses", type=float, nargs="+", default=[25])
    parser.add_argument("--meta-max-starvation-penalties", type=float, nargs="+", default=[0.5])
    parser.add_argument("--meta-ped-max-red-steps", type=float, nargs="+", default=[90])

    parser.add_argument("--meta-hard-streak-caps", type=int, nargs="+", default=[2, 3])
    parser.add_argument("--meta-sigmoid-steepnesses", type=float, nargs="+", default=[-0.4, -0.6])
    parser.add_argument("--meta-zero-waste-multipliers", type=float, nargs="+", default=[0.01, 0.05])
    parser.add_argument("--meta-min-green-time-preempts", type=int, nargs="+", default=[20, 30])
    parser.add_argument("--meta-queue-flush_factors", type=float, nargs="+", default=[5.0, 10.0])
    parser.add_argument("--meta-fairness-penalties", type=float, nargs="+", default=[140.0])
    parser.add_argument("--meta-startup-stretches", type=float, nargs="+", default=[5.0])
    parser.add_argument("--meta-max-ped-phase-durations", type=int, nargs="+", default=[12, 15])
    parser.add_argument("--meta-high-switch-mults", type=float, nargs="+", default=[2.5, 4.5])
    parser.add_argument("--meta-high-bonus-mults", type=float, nargs="+", default=[2.0, 4.0])
    parser.add_argument("--meta-high-starv_mults", type=float, nargs="+", default=[0.2, 0.5])
    parser.add_argument("--meta-low-switch-mults", type=float, nargs="+", default=[0.4, 0.8])
    parser.add_argument("--meta-low-bonus-mults", type=float, nargs="+", default=[0.5, 0.9])
    parser.add_argument("--meta-low-starv_mults", type=float, nargs="+", default=[0.1, 0.3])

    # Goal-oriented optimization
    parser.add_argument("--goal", choices=ALL_GOALS, default=GOAL_BALANCED, help="Optimization focus goal.")
    parser.add_argument("--strict-starvation", action="store_true", help="Reject any candidate with Starvation Events > 0.")
    parser.add_argument("--max-queue-cap", type=int, default=100, help="Maximum allowed queue length (vehicles) before rejection.")
    parser.add_argument("--max-trend", type=float, default=2.0, help="Maximum allowed Queue Trend ratio (end/start) before rejection.")
    parser.add_argument("--patience-cap", type=int, default=300, help="Maximum allowed delay (seconds) for any vehicle before rejection.")
    parser.add_argument("--baseline-name", type=str, default="fixed no preempt", help="Scenario name to use as comparison baseline.")
    parser.add_argument("--benchmark-mode", action="store_true", help="Pass --benchmark-mode to the simulation.")
    parser.add_argument(
        "--optimize-config",
        type=str,
        default="adaptive_weighted_with_preempt",
        choices=[
            "fixed_no_preempt",
            "fixed_with_preempt",
            "adaptive_no_preempt",
            "adaptive_weighted",
            "adaptive_with_preempt",
            "adaptive_weighted_with_preempt",
        ],
        help="Base controller configuration to optimize during rapid grid search.",
    )

    return parser


if __name__ == "__main__":
    run_rapid_search(build_parser().parse_args())
