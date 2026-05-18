import os
import sys
import time
import csv
import shutil
import json
import copy
from datetime import datetime, timedelta
import argparse

from sim_unit.network.network_manager import NetworkManager, NetworkConstructor
from sim_unit.utilities.path_utils import get_sumo_config_dir, get_sys_output_dir, get_workspace_root


REPO_ROOT = get_workspace_root(__file__)


def percentile(values, pct):
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    k = (len(sorted_vals) - 1) * (pct / 100.0)
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return float(sorted_vals[f])
    d0 = sorted_vals[f] * (c - k)
    d1 = sorted_vals[c] * (k - f)
    return float(d0 + d1)


def _serialize_datetime(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _normalize_light_status(value):
    if not isinstance(value, str):
        return None

    normalized = value.strip().lower()
    if normalized in {"green", "yellow", "red"}:
        return normalized
    return None


def _build_light_timing_summary(history, status_key):
    durations = {"green": [], "yellow": [], "red": []}

    ordered_points = []
    for point in sorted(history or [], key=lambda item: int(item.get("step", 0) or 0)):
        status = _normalize_light_status(point.get(status_key))
        if status is None:
            continue
        ordered_points.append((int(point.get("step", 0) or 0), status))

    if not ordered_points:
        return {
            "greenToRedChanges": 0,
            "durations": {
                color: {"min": 0.0, "max": 0.0, "avg": 0.0, "all": []} for color in durations
            },
        }

    green_to_red_changes = 0
    saw_green_since_last_red = ordered_points[0][1] == "green"
    
    phase_start_step = ordered_points[0][0]
    current_status = ordered_points[0][1]
    is_first_phase = True

    for step, status in ordered_points[1:]:
        if status != current_status:
            duration = float(step - phase_start_step)
            if duration > 0:
                if not is_first_phase:
                    durations[current_status].append(duration)
                is_first_phase = False
                
            if status == "green":
                saw_green_since_last_red = True
            elif status == "red" and saw_green_since_last_red:
                green_to_red_changes += 1
                saw_green_since_last_red = False

            current_status = status
            phase_start_step = step
    return {
        "greenToRedChanges": green_to_red_changes,
        "durations": {
            color: {
                "min": min(values) if values else 0.0,
                "max": max(values) if values else 0.0,
                "avg": sum(values) / len(values) if values else 0.0,
                "all": values,
            }
            for color, values in durations.items()
        },
    }

def _load_sumolib():
    sumo_home = os.environ.get('SUMO_HOME', '/usr/share/sumo')
    os.environ['SUMO_HOME'] = sumo_home
    tools_path = os.path.join(sumo_home, 'tools')

    if tools_path not in sys.path:
        sys.path.append(tools_path)

    try:
        import sumolib
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            f"Could not import sumolib from {tools_path}. "
            "Set SUMO_HOME to your SUMO installation path."
        ) from exc

    return sumolib

def main():
    # --- EMERGENCY VEHICLE CONFIGURATION ---
    ADD_EMERGENCY = True
    EMERGENCY_PERCENTAGE = 0.005  # 0.5%

    parser = argparse.ArgumentParser(description="Run SUMO simulations with selectable input mode.")
    parser.add_argument(
        "--mode",
        choices=["generic", "real"],
        default="real",
        help="generic: use generic random traffic generator; real: build from JSON input files",
    )
    parser.add_argument(
        "--real-traffic-source",
        choices=["stream", "synthetic"],
        default="synthetic",
        help="Traffic source in real mode: stream (placeholder) or synthetic (usable now)",
    )
    parser.add_argument(
        "--real-total-sim",
        type=int,
        default=720,
        help="Simulation horizon used in real mode",
    )
    parser.add_argument(
        "--gui-rotate-deg",
        type=float,
        default=0.0,
        help="Rotate SUMO GUI clockwise by N degrees at simulation start",
    )
    parser.add_argument(
        "--use-gui",
        action="store_true",
        help="Run SUMO with GUI (sumo-gui) instead of headless sumo",
    )
    parser.add_argument(
        "--early-stop",
        action="store_true",
        help="Abort simulation early if performance degrades severely.",
    )
    parser.add_argument(
        "--sim-time",
        type=int,
        default=300,
        help="Total simulation time (horizon) in seconds. Overrides real-total-sim if provided.",
    )
    parser.add_argument(
        "--benchmark-mode",
        action="store_true",
        help="Enable strict benchmark reproducibility (all scenarios start at identical TLS phase boundary).",
    )

    parser.add_argument(
        "--meta-candidates",
        action="store_true",
        help="Run meta-tuning candidates defined in the system config."
    )
    parser.add_argument(
        "--meta-base-config",
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
        help="Base controller configuration used when running meta-tuning candidates.",
    )
    parser.add_argument(
        "--goal-profiles",
        action="store_true",
        help="Run all goal-optimized profiles defined in optimization_config.json."
    )
    parser.add_argument(
        "--goal-matrix",
        action="store_true",
        help="Run all 6 simulation configurations across baseline and all goal-optimized profiles."
    )
    parser.add_argument(
        "--ped-mode",
        choices=["vehicle_first", "balanced", "pedestrian_first"],
        help="Override the pedestrian mode for all adaptive scenarios."
    )
    parser.add_argument(
        "--include-configs",
        type=str,
        nargs="+",
        help="Specific configuration names (ids) to run. If omitted, all defaults are run."
    )
    args = parser.parse_args()

    sumolib = _load_sumolib()

    # Validate that SUMO binaries are discoverable via sumolib.
    sumolib.checkBinary('sumo')
    
    TOTAL_SIM = args.sim_time # Default for generic mode
    results_dir = get_sys_output_dir(REPO_ROOT)
    wall_clock_start = datetime.now()
    sumocfg_path = ""
    scenario_start_datetime = None
    scenario_end_datetime = None
    json_start_datetime = None
    json_frames = []
    network_layout_config_path = os.path.join(REPO_ROOT, "input_data", "sys_config", "network_layout_config.json")
    system_param_config_path = os.path.join(REPO_ROOT, "input_data", "sys_config", "system_param_config.json")
    optimization_config_path = os.path.join(REPO_ROOT, "input_data", "sys_config", "optimization_config.json")
    sumo_config_dir = get_sumo_config_dir(REPO_ROOT)
    network_config = {}

    try:
        with open(network_layout_config_path, "r") as f:
            network_config = json.load(f)
        with open(system_param_config_path, "r") as f:
            network_config.update(json.load(f))
        with open(optimization_config_path, "r") as f:
            network_config.update(json.load(f))
    except Exception as exc:
        print(f"Warning: could not load configs: {exc}")

    if os.path.exists(sumo_config_dir):
        shutil.rmtree(sumo_config_dir)
    os.makedirs(sumo_config_dir, exist_ok=True)
    os.makedirs(results_dir, exist_ok=True)

    # Pass strict min green flag to simulation manager

    # 1. Build Config based on mode
    if args.mode == "real":
        # Build layout from input_data/sys_config/network_layout_config.json
        nc = NetworkConstructor(
            config_file=network_layout_config_path,
            output_dir=sumo_config_dir
        )
        nc.build_network_layout()

        if args.sim_time is not None:
            TOTAL_SIM = args.sim_time
        else:
            TOTAL_SIM = args.real_total_sim
        if args.real_traffic_source == "synthetic":
            nc.traffic_generator(TOTAL_SIM, mode="synthetic", add_emergency=ADD_EMERGENCY, emergency_percentage=EMERGENCY_PERCENTAGE)
            nc.create_sumo_config(
                route_files="routes.rou.xml,flows.rou.xml,p_routes.rou.xml",
                additional_files="vtypes.add.xml",
                total_time=TOTAL_SIM,
            )
            sumocfg_path = os.path.join(sumo_config_dir, "my.sumocfg")
            scenario_start_datetime = datetime.now()
            if TOTAL_SIM:
                scenario_end_datetime = scenario_start_datetime + timedelta(seconds=TOTAL_SIM)
        else:
            derived_total_sim = nc.traffic_generator(TOTAL_SIM, mode="stream", add_emergency=ADD_EMERGENCY, emergency_percentage=EMERGENCY_PERCENTAGE)
            if "--sim-time" in sys.argv and args.sim_time is not None:
                TOTAL_SIM = args.sim_time
            elif derived_total_sim is not None:
                TOTAL_SIM = derived_total_sim

            json_start_datetime = getattr(nc, "stream_start_datetime", None)
            json_frames = list(getattr(nc, "stream_json_frames", []) or [])
            scenario_start_datetime = json_start_datetime
            
            if isinstance(scenario_start_datetime, str):
                try:
                    scenario_start_datetime = datetime.fromisoformat(scenario_start_datetime.replace("Z", "+00:00"))
                except:
                    pass
            json_start_datetime = scenario_start_datetime

            if scenario_start_datetime and TOTAL_SIM:
                 scenario_end_datetime = scenario_start_datetime + timedelta(seconds=TOTAL_SIM)

            nc.create_sumo_config(total_time=TOTAL_SIM)
            sumocfg_path = os.path.join(sumo_config_dir, "my.sumocfg")

    else: # args.mode == "generic"
        nm = NetworkManager(config_dir=sumo_config_dir)
        nm.build_network()
        nm.generate_traffic(TOTAL_SIM, add_emergency=ADD_EMERGENCY, emergency_percentage=EMERGENCY_PERCENTAGE)
        nm.create_sumo_config(TOTAL_SIM)
        sumocfg_path = nm.cfg_file
        scenario_start_datetime = datetime.now()
        if TOTAL_SIM:
            scenario_end_datetime = scenario_start_datetime + timedelta(seconds=TOTAL_SIM)
        print(f"Using generic data mode. Simulation time: {TOTAL_SIM}s")
    
    from sim_unit.core.simulation_manager import SimulationManager
    from sim_unit.priority.priority_system import PrioritySystem
    from sim_unit.traffic_control.pedestrian_handler import PedestrianHandler

    sm = SimulationManager(sumocfg=sumocfg_path, log_dir=results_dir, network_config=network_config)

    all_results = {}
    all_ev_stats = {}
    all_pt_stats = {}
    all_lifecycle_stats = {}
    all_histories = {}

    # Create run-scoped dashboard export path early so UI can see progress even if execution stops mid-run.
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dashboard_root = os.path.join(results_dir, "dashboard_data")
    json_export_dir = os.path.join(dashboard_root, timestamp)
    os.makedirs(json_export_dir, exist_ok=True)
    with open(os.path.join(dashboard_root, "latest.json"), 'w') as f:
        json.dump(
            {
                "latest_run_folder": timestamp,
                "wall_clock_start": _serialize_datetime(wall_clock_start),
                "scenario_start": _serialize_datetime(scenario_start_datetime),
                "run_type": "simulation",
                "optimization_goal": "N/A",
                "base_config_optimized": "N/A",
            },
            f,
        )

    def write_dashboard_snapshot(summary_payload=None):
        history_by_mode = {
            name.replace('_', ' ').title(): history
            for name, history in all_histories.items()
        }
        with open(os.path.join(json_export_dir, "history_by_mode.json"), 'w') as f:
            json.dump(history_by_mode, f, indent=4)

        if summary_payload is not None:
            with open(os.path.join(json_export_dir, "summary.json"), 'w') as f:
                json.dump(summary_payload, f, indent=4)

    write_dashboard_snapshot(summary_payload=[])
    
    # Execution Configurations
    default_configurations = [
        {"mode": "fixed",    "ev_preemption": False, "use_priority": False, "name": "fixed_no_preempt", "ped_mode": "balanced"},
        {"mode": "fixed",    "ev_preemption": True,  "use_priority": False, "name": "fixed_with_preempt", "ped_mode": "balanced"},
        {"mode": "adaptive", "ev_preemption": False, "use_priority": False, "name": "adaptive_no_preempt", "ped_mode": "balanced"},
        {"mode": "adaptive", "ev_preemption": False, "use_priority": True,  "name": "adaptive_weighted", "ped_mode": "balanced"},
        {"mode": "adaptive", "ev_preemption": True,  "use_priority": False,  "name": "adaptive_with_preempt", "ped_mode": "balanced"},
        {"mode": "adaptive", "ev_preemption": True, "use_priority": True, "name": "adaptive_weighted_with_preempt","ped_mode": "balanced"},
    ]

    if getattr(args, "goal_matrix", False):
        configurations = []
        opt_cfg_path = os.path.join(REPO_ROOT, "input_data", "sys_config", "optimization_config.json")
        opt_data = {}
        if os.path.exists(opt_cfg_path):
            try:
                with open(opt_cfg_path, "r") as f:
                    opt_data = json.load(f)
            except Exception:
                pass
        
        goals_dict = opt_data.get("optimized_profiles_by_goal", {})
        
        for c in default_configurations:
            cfg_copy = dict(c)
            cfg_copy["name"] = f"baseline_{c['name']}"
            configurations.append(cfg_copy)
            
        for g_name, g_data in goals_dict.items():
            for c in default_configurations:
                cfg_copy = dict(c)
                cfg_copy["name"] = f"goal_{g_name}_{c['name']}"
                cfg_copy["meta_profile"] = g_data.get("profile", {})
                configurations.append(cfg_copy)
    elif getattr(args, "goal_profiles", False):
        # When running goal profiles comparison, we use the baseline and all 7 goal profiles
        configurations = [
            {"mode": "fixed", "ev_preemption": False, "use_priority": False, "name": "fixed_no_preempt", "ped_mode": "balanced"}
        ]
        # Load optimization_config.json directly to be absolutely certain we get the latest sweep results
        opt_cfg_path = os.path.join(REPO_ROOT, "input_data", "sys_config", "optimization_config.json")
        opt_data = {}
        if os.path.exists(opt_cfg_path):
            try:
                with open(opt_cfg_path, "r") as f:
                    opt_data = json.load(f)
            except Exception:
                pass
        
        goals_dict = opt_data.get("optimized_profiles_by_goal", {})
        for g_name, g_data in goals_dict.items():
            configurations.append({
                "mode": "adaptive",
                "ev_preemption": True,
                "use_priority": True,
                "name": f"adaptive_goal_{g_name}",
                "ped_mode": "balanced",
                "meta_profile": g_data.get("profile", {})
            })
    else:
        if args.include_configs:
            configurations = [c for c in default_configurations if c["name"] in args.include_configs]
        else:
            configurations = list(default_configurations)

        # Handle meta-candidates from optimizer
        if args.meta_candidates and "meta_tuning_candidates" in network_config:
            base_mode = "fixed" if args.meta_base_config.startswith("fixed") else "adaptive"
            base_ev = "with_preempt" in args.meta_base_config
            base_prio = "weighted" in args.meta_base_config

            for mc in network_config["meta_tuning_candidates"]:
                configurations.append({
                    "mode": base_mode,
                    "ev_preemption": base_ev,
                    "use_priority": base_prio,
                    "name": f"adaptive_meta_{mc['name']}",
                    "ped_mode": "balanced",
                    "meta_profile": mc.get("profile", mc)
                })


    baseline_cache_path = os.path.join(results_dir, "dashboard_data", ".baseline_cache.json")
    baseline_cache = {}
    if os.path.exists(baseline_cache_path):
        try:
            with open(baseline_cache_path, "r") as f:
                baseline_cache = json.load(f)
        except Exception:
            pass

    cache_key_horizon = str(TOTAL_SIM)
    horizon_cache = baseline_cache.setdefault(cache_key_horizon, {})

    total_start_time = time.time()
    base_network_config = copy.deepcopy(network_config)

    for config in configurations:
        print(f"\n>>> RUNNING: {config['name'].upper()}")
        
        if args.meta_candidates and config["name"] in ["fixed_no_preempt", "fixed_with_preempt", "adaptive_no_preempt", "adaptive_weighted", "adaptive_with_preempt", "adaptive_weighted_with_preempt"]:
            if config["name"] in horizon_cache:
                print(f"⚡ Loading {config['name'].upper()} directly from baseline cache (horizon={TOTAL_SIM}s)...")
                cached = horizon_cache[config["name"]]
                all_results[config["name"]] = cached["all_results"]
                all_ev_stats[config["name"]] = cached["all_ev_stats"]
                all_pt_stats[config["name"]] = cached["all_pt_stats"]
                all_lifecycle_stats[config["name"]] = cached["all_lifecycle_stats"]
                all_histories[config["name"]] = cached["all_histories"]
                config["ped_collisions"] = cached["ped_collisions"]
                config["starvation_events"] = cached["starvation_events"]
                config["emissions"] = cached["emissions"]
                config["total_pedestrians"] = cached["total_pedestrians"]
                config["total_vehicles"] = cached["total_vehicles"]
                config["throughput"] = cached["throughput"]
                config["vehicle_type_counts"] = cached["vehicle_type_counts"]
                config["initial_green"] = cached["initial_green"]
                config["initial_yellow"] = cached["initial_yellow"]
                config["initial_red"] = cached["initial_red"]
                continue

        sim_start_time = time.time()
        
        # Reset network_config and sm.network_config
        network_config = copy.deepcopy(base_network_config)
        sm.network_config = network_config

        preemption_policy = dict(network_config.get("ev_preemption_policy", {}))
        if "preemption_profile" in config:
            preemption_policy.update(config["preemption_profile"])
        soft_priority_policy = dict(network_config.get("adaptive_priority_policy", {}))
        if "soft_priority_profile" in config:
            soft_priority_policy.update(config["soft_priority_profile"])
        adaptive_no_preempt_policy = dict(network_config.get("adaptive_control", {}).get("no_preempt_policy", {}))
        if "adaptive_no_preempt_profile" in config:
            adaptive_no_preempt_policy.update(config["adaptive_no_preempt_profile"])
        dynamic_red_profile = dict(network_config.get("adaptive_control", {}).get("dynamic_max_red", {}))
        ped_profile = {}

        if "meta_profile" in config and isinstance(config["meta_profile"], dict):
            meta_profile = config["meta_profile"]
            if "preemption_profile" in meta_profile:
                preemption_policy.update(meta_profile["preemption_profile"])
            if "ev_preemption_policy" in meta_profile:
                preemption_policy.update(meta_profile["ev_preemption_policy"])
            
            if "soft_priority_profile" in meta_profile:
                soft_priority_policy.update(meta_profile["soft_priority_profile"])
            if "adaptive_priority_policy" in meta_profile:
                soft_priority_policy.update(meta_profile["adaptive_priority_policy"])
                
            if "adaptive_no_preempt_profile" in meta_profile:
                adaptive_no_preempt_policy.update(meta_profile["adaptive_no_preempt_profile"])
            if "no_preempt_policy" in meta_profile:
                adaptive_no_preempt_policy.update(meta_profile["no_preempt_policy"])
            
            if "dynamic_red_profile" in meta_profile:
                dynamic_red_profile.update(meta_profile["dynamic_red_profile"])
            
            if "ped_profile" in meta_profile:
                ped_profile.update(meta_profile["ped_profile"])
            if "pedestrian_control" in meta_profile:
                ped_profile.update(meta_profile["pedestrian_control"])

            if "adaptive_control" in meta_profile:
                ac = meta_profile["adaptive_control"]
                if "no_preempt_policy" in ac:
                    adaptive_no_preempt_policy.update(ac["no_preempt_policy"])
                if "dynamic_max_red" in ac:
                    dynamic_red_profile.update(ac["dynamic_max_red"])
                ac_target = network_config.setdefault("adaptive_control", {})
                for k, v in ac.items():
                    if isinstance(v, dict):
                        target_sub = ac_target.setdefault(k, {})
                        for sub_k, sub_v in v.items():
                            if isinstance(sub_v, dict):
                                target_sub.setdefault(sub_k, {}).update(sub_v)
                            else:
                                target_sub[sub_k] = sub_v
                    else:
                        ac_target[k] = v

        network_config.setdefault("adaptive_control", {})["no_preempt_policy"] = adaptive_no_preempt_policy
        network_config.setdefault("adaptive_control", {})["dynamic_max_red"] = dynamic_red_profile
        priority_system = PrioritySystem(
            sm.logger,
            ev_preemption_enabled=config["ev_preemption"],
            policy_config=preemption_policy,
            soft_priority_config=soft_priority_policy,
        )
        # Pedestrian Handler Setup
        ped_profile_cfg = network_config.get("pedestrian_control", {})
        
        # Determine the mode (CLI > scenario config > global default)
        ped_mode = args.ped_mode or config.get("ped_mode") or ped_profile_cfg.get("active_mode") or "balanced"
        
        # Determine the weight for this mode from config if it exists
        weight_key = f"weight_{ped_mode}"
        custom_weight = ped_profile_cfg.get(weight_key)
        
        # Read dynamic parameters
        p_thresh = ped_profile_cfg.get("priority_threshold", 20)
        m_dur = ped_profile_cfg.get("max_ped_phase_duration", 60)
        ext_ped = ped_profile_cfg.get("extension_per_ped", 2.0)
        if "ped_priority_threshold" in ped_profile:
            p_thresh = ped_profile["ped_priority_threshold"]
            
        ped_handler = PedestrianHandler(
            sm.logger, 
            ped_mode=ped_mode, 
            custom_weight=custom_weight, 
            priority_threshold=p_thresh, 
            max_ped_phase_duration=m_dur,
            extension_per_ped=ext_ped,
            clearance_time=ped_profile_cfg.get("clearance_time", 3.0),
            cooldown=ped_profile_cfg.get("cooldown", 30.0),
            base_duration=ped_profile_cfg.get("base_duration", 10.0)
        )
        print(f"DEBUG: Initializing PedestrianHandler with Mode: {ped_mode}, "
              f"MaxDuration: {m_dur}s, Extension: {ext_ped}s")
        sm.logger.log_event(0, getattr(sm.logger, "mode", "SYSTEM"), getattr(sm.logger, "ev_preemption", False), "SYSTEM", "ALL", 
                            f"Pedestrian Handler initialized: mode={ped_mode}, threshold={p_thresh}, max_dur={m_dur}, ext={ext_ped}")
        results, history, ped_collisions, starvation_events, emissions_data, ev_stats, pt_stats, lifecycle_stats = sm.run(
            TOTAL_SIM,
            mode=config["mode"],
            ev_preemption=config["ev_preemption"],
            use_priority=config["use_priority"],
            priority_system=priority_system,
            ped_handler=ped_handler,
            config_name=config["name"],
            strict_start_boundary=args.benchmark_mode,
            use_gui=args.use_gui,
            gui_rotate_deg=args.gui_rotate_deg, # Pass gui_rotate_deg
            json_start_datetime=json_start_datetime, # Pass for real data
            json_frames=json_frames, # Pass for real data
            is_stream=(args.mode == "real" and args.real_traffic_source == "stream"),
        )

        all_results[config["name"]] = results
        all_ev_stats[config["name"]] = ev_stats
        all_pt_stats[config["name"]] = pt_stats
        all_lifecycle_stats[config["name"]] = lifecycle_stats
        all_histories[config["name"]] = history
        config["ped_collisions"] = ped_collisions
        config["starvation_events"] = starvation_events
        config["emissions"] = emissions_data
        config["total_pedestrians"] = getattr(sm, "total_pedestrians_spawned", 0)
        config["total_vehicles"] = getattr(sm, "total_vehicles_spawned", 0)
        config["throughput"] = sum(r.get("throughput", 0) for r in results)
        config["vehicle_type_counts"] = getattr(sm, "total_vehicle_type_counts", {})
        config["initial_green"] = getattr(sm, "initial_green", 0)
        config["initial_yellow"] = getattr(sm, "initial_yellow", 0)
        config["initial_red"] = getattr(sm, "initial_red", 0)

        write_dashboard_snapshot()
        
        if args.meta_candidates and config["name"] in ["fixed_no_preempt", "fixed_with_preempt", "adaptive_no_preempt", "adaptive_weighted", "adaptive_with_preempt", "adaptive_weighted_with_preempt"]:
            horizon_cache[config["name"]] = {
                "all_results": all_results[config["name"]],
                "all_ev_stats": all_ev_stats[config["name"]],
                "all_pt_stats": all_pt_stats[config["name"]],
                "all_lifecycle_stats": all_lifecycle_stats[config["name"]],
                "all_histories": all_histories[config["name"]],
                "ped_collisions": config["ped_collisions"],
                "starvation_events": config["starvation_events"],
                "emissions": config["emissions"],
                "total_pedestrians": config["total_pedestrians"],
                "total_vehicles": config["total_vehicles"],
                "throughput": config["throughput"],
                "vehicle_type_counts": config["vehicle_type_counts"],
                "initial_green": config["initial_green"],
                "initial_yellow": config["initial_yellow"],
                "initial_red": config["initial_red"]
            }
            os.makedirs(os.path.dirname(baseline_cache_path), exist_ok=True)
            try:
                with open(baseline_cache_path, "w") as f:
                    json.dump(baseline_cache, f, indent=4)
            except Exception as exc:
                print(f"Warning: could not write baseline cache: {exc}")

        sim_duration = time.time() - sim_start_time
        print(f"  ✅ Finished in {sim_duration:.1f}s")

    summary_stats = []
    
    for config in configurations:
        name = config["name"]
        res = all_results.get(name)
        if not res:
            print(f"{name:<25} {'No Data':<15} {'No Data':<12} {'No Data':<12} {'No Data':<12} {'No Data':<12} {'No Data':<15} {'No Data':<15} {'No Data':<15}")
            continue
            
        all_v_vals = [r.get('all_v_wait_avg', 0) for r in res]
        all_v_avg = sum(all_v_vals) / len(all_v_vals) if all_v_vals else 0

        # Calculate averages across the entire simulation
        v_vals = [r.get('v_wait_avg', 0) for r in res]
        v_life_avg = res[-1].get('v_life_avg', 0.0) if res else 0.0
        p_life_avg = res[-1].get('p_life_avg', 0.0) if res else 0.0
        ev_life_avg = res[-1].get('ev_life_avg', 0.0) if res else 0.0
        pt_life_avg = res[-1].get('pt_life_avg', 0.0) if res else 0.0
        reg_life_avg = res[-1].get('reg_life_avg', 0.0) if res else 0.0
        v_avg = sum(v_vals) / len(v_vals) if v_vals else 0

        p_vals = [r.get('p_wait_avg', 0) for r in res]
        p_avg = sum(p_vals) / len(p_vals) if p_vals else 0
        
        ped_wait_counts = [r.get('ped_count', 0) for r in res]
        ped_cross_counts = [r.get('ped_crossing_count', 0) for r in res]
        avg_ped_waiting = sum(ped_wait_counts) / len(ped_wait_counts) if ped_wait_counts else 0.0
        avg_ped_crossing = sum(ped_cross_counts) / len(ped_cross_counts) if ped_cross_counts else 0.0

        avg_queue_car = sum(r.get('ns_queue', 0) + r.get('ew_queue', 0) for r in res) / len(res) if res else 0.0
        avg_crossing_car = max([r.get('crossing_car', 0) for r in res] or [0.0])

        avg_queue_truck = sum(r.get('truck_count', 0) for r in res) / len(res) if res else 0.0
        avg_crossing_truck = max([r.get('crossing_truck', 0) for r in res] or [0.0])
        avg_queue_moto = sum(r.get('motorcycle_count', 0) for r in res) / len(res) if res else 0.0
        avg_crossing_moto = max([r.get('crossing_motorcycle', 0) for r in res] or [0.0])
        avg_queue_bus = sum(r.get('pt_count', 0) for r in res) / len(res) if res else 0.0
        avg_crossing_bus = max([r.get('crossing_bus', 0) for r in res] or [0.0])
        avg_queue_ev = sum(r.get('emergency_vehicle_count', 0) for r in res) / len(res) if res else 0.0
        avg_crossing_ev = max([r.get('crossing_emergency', 0) for r in res] or [0.0])
        life_stats = all_lifecycle_stats.get(name, (0.0, 0.0))
        v_life_avg = life_stats[0]
        p_life_avg = life_stats[1]

        ev_stat_bundle = all_ev_stats.get(name, (0.0, 0.0, 0.0, []))
        ev_avg = ev_stat_bundle[0]
        ev_max = ev_stat_bundle[1]
        ev_total = ev_stat_bundle[2]
        ev_all_waits = ev_stat_bundle[3]
        
        pt_stat_bundle = all_pt_stats.get(name, (0.0, 0.0, 0.0, []))
        pt_avg = pt_stat_bundle[0]
        pt_max = pt_stat_bundle[1]
        pt_total = pt_stat_bundle[2]
        pt_all_waits = pt_stat_bundle[3]
        
        all_v_max = max([r.get('all_v_wait_max', 0) for r in res] or [0])
        v_max = max([r.get('v_wait_max', 0) for r in res] or [0])
        p_max = max([r.get('p_wait_max', 0) for r in res] or [0])
        pt_max = max([r.get('pt_wait_max', 0) for r in res] or [0])
        
        all_p_waits = [r.get('p_wait_max', 0) for r in res if r.get('p_wait_max', 0) > 0]
        ped_p95 = percentile(all_p_waits, 95) if all_p_waits else 0.0
        
        # --- STEADY STATE CALCULATION (Post-Warmup) ---
        warmup_limit = TOTAL_SIM // 5 if TOTAL_SIM > 500 else 0
        steady_res = [r for r in res if r.get('step', 0) > warmup_limit]
        
        v_steady_avg = sum(r.get('v_wait_avg', 0) for r in steady_res) / len(steady_res) if steady_res else 0.0
        all_v_steady_avg = sum(r.get('all_v_wait_avg', 0) for r in steady_res) / len(steady_res) if steady_res else 0.0
        p_steady_avg = sum(r.get('p_wait_avg', 0) for r in steady_res) / len(steady_res) if steady_res else 0.0
        ev_steady_avg = sum(r.get('ev_wait_avg', 0) for r in steady_res) / len(steady_res) if steady_res else 0.0
        pt_steady_avg = sum(r.get('pt_wait_avg', 0) for r in steady_res) / len(steady_res) if steady_res else 0.0
        
        v_steady_max = max([r.get('v_wait_max', 0) for r in steady_res] or [0])
        all_v_steady_max = max([r.get('all_v_wait_max', 0) for r in steady_res] or [0])
        p_steady_max = max([r.get('p_wait_max', 0) for r in steady_res] or [0])
        ev_steady_max = max([r.get('ev_wait_max', 0) for r in steady_res] or [0])
        pt_steady_max = max([r.get('pt_wait_max', 0) for r in steady_res] or [0])
        
        v_steady_life = sum(r.get('v_life_avg', 0) for r in steady_res) / len(steady_res) if steady_res else 0.0
        p_steady_life = sum(r.get('p_life_avg', 0) for r in steady_res) / len(steady_res) if steady_res else 0.0
        ev_steady_life = sum(r.get('ev_life_avg', 0) for r in steady_res) / len(steady_res) if steady_res else 0.0
        pt_steady_life = sum(r.get('pt_life_avg', 0) for r in steady_res) / len(steady_res) if steady_res else 0.0
        reg_steady_life = sum(r.get('reg_life_avg', 0) for r in steady_res) / len(steady_res) if steady_res else 0.0
        
        ev_p95 = percentile(ev_all_waits, 95)
        ev_p99 = percentile(ev_all_waits, 99)
        pt_p95 = percentile(pt_all_waits, 95)
        pt_p99 = percentile(pt_all_waits, 99)
        ped_p95 = percentile([r.get('p_wait_max', 0) for r in res if r.get('p_wait_max', 0) > 0], 95)
        ped_p99 = percentile([r.get('p_wait_max', 0) for r in res if r.get('p_wait_max', 0) > 0], 99)
        veh_p95 = percentile([r.get('all_v_wait_max', 0) for r in res if r.get('all_v_wait_max', 0) > 0], 95)
        veh_p99 = percentile([r.get('all_v_wait_max', 0) for r in res if r.get('all_v_wait_max', 0) > 0], 99)
        reg_v_p95 = percentile([r.get('v_wait_max', 0) for r in res if r.get('v_wait_max', 0) > 0], 95)
        reg_v_p99 = percentile([r.get('v_wait_max', 0) for r in res if r.get('v_wait_max', 0) > 0], 99)
        ped_time_saved = max([r.get('ped_time_saved', 0) for r in res] or [0])
        ped_collisions = config.get("ped_collisions", 0)
        starvation_events = config.get("starvation_events", 0)
        
        total_vehicle_stops = max([r.get('total_vehicle_stops', 0) for r in res] or [0])
        avg_time_loss_list = [r.get('avg_time_loss', 0) for r in res]
        avg_time_loss = sum(avg_time_loss_list) / len(avg_time_loss_list) if avg_time_loss_list else 0.0
        preemption_force_switches = max([r.get('preemption_force_switches', 0) for r in res] or [0])
        preemption_holds = max([r.get('preemption_holds', 0) for r in res] or [0])
        preemption_total = max([r.get('preemption_total', 0) for r in res] or [0])
        max_queue_length = max([r.get('max_queue_length', 0) for r in res] or [0])

        congestion_list = [(r.get('ns_congestion', 0) + r.get('ew_congestion', 0)) / 2 for r in res]
        avg_congestion = sum(congestion_list) / len(congestion_list) if congestion_list else 0.0
        
        congestion_demand_list = [(r.get('ns_congestion_demand', 0) + r.get('ew_congestion_demand', 0)) / 2 for r in res]
        avg_congestion_demand = sum(congestion_demand_list) / len(congestion_demand_list) if congestion_demand_list else 0.0
        
        recovery_steps = sum(1 for r in res if r.get('event_preemption_active', 0) > 0 or r.get('event_starvation_active', 0) > 0)
        recovery_ratio = recovery_steps / len(res) if res else 0.0
        
        util_list = [r.get('lane_utilization', 0) for r in res]
        avg_utilization = sum(util_list) / len(util_list) if util_list else 0.0

        slice_size = max(1, len(res) // 5)
        first_slice = res[:slice_size]
        last_slice = res[-slice_size:]
        
        avg_q_first = sum(r.get('ns_queue', 0) + r.get('ew_queue', 0) for r in first_slice) / slice_size if first_slice else 0.0
        avg_q_last = sum(r.get('ns_queue', 0) + r.get('ew_queue', 0) for r in last_slice) / slice_size if last_slice else 0.0
        queue_trend = avg_q_last / avg_q_first if avg_q_first > 0.5 else (1.0 + avg_q_last / 10.0)
        
        avg_d_first = sum(r.get('all_v_wait_avg', 0) for r in first_slice) / slice_size if first_slice else 0.0
        avg_d_last = sum(r.get('all_v_wait_avg', 0) for r in last_slice) / slice_size if last_slice else 0.0
        delay_trend = avg_d_last / avg_d_first if avg_d_first > 0.5 else (1.0 + avg_d_last / 10.0)

        mid = len(res) // 2
        first_half = res[:mid]
        second_half = res[mid:]
        
        q_h1 = sum(r.get('ns_queue', 0) + r.get('ew_queue', 0) for r in first_half) / mid if mid > 0 else 0.0
        q_h2 = sum(r.get('ns_queue', 0) + r.get('ew_queue', 0) for r in second_half) / (len(res)-mid) if (len(res)-mid) > 0 else 0.0
        slice_variance = abs(q_h2 - q_h1) / (q_h1 + 1.0) # Relative variance

        hist = all_histories.get(name)
        ns_signal_timing = _build_light_timing_summary(res, "ns_light_status")
        ew_signal_timing = _build_light_timing_summary(res, "ew_light_status")
        display_name = name.replace('_', ' ').title()
        
        summary_stats.append({
            'config': display_name,
            'all_v_avg': all_v_avg, 'v_avg': v_avg, 'ev_avg': ev_avg, 'pt_avg': pt_avg, 'p_avg': p_avg,
            'v_life_avg': v_life_avg, 'p_life_avg': p_life_avg,
            'ev_life_avg': ev_life_avg, 'pt_life_avg': pt_life_avg, 'reg_life_avg': reg_life_avg,
            'v_steady_avg': v_steady_avg, 'all_v_steady_avg': all_v_steady_avg, 'p_steady_avg': p_steady_avg,
            'ev_steady_avg': ev_steady_avg, 'pt_steady_avg': pt_steady_avg,
            'v_steady_max': v_steady_max, 'all_v_steady_max': all_v_steady_max, 'p_steady_max': p_steady_max,
            'ev_steady_max': ev_steady_max, 'pt_steady_max': pt_steady_max,
            'v_steady_life': v_steady_life, 'p_steady_life': p_steady_life,
            'ev_steady_life': ev_steady_life, 'pt_steady_life': pt_steady_life, 'reg_steady_life': reg_steady_life,
            'ev_total': ev_total, 'pt_total': pt_total,
            'all_v_max': all_v_max, 'v_max': v_max, 'ev_max': ev_max, 'pt_max': pt_max, 'p_max': p_max,
            'ev_p95': ev_p95, 'ev_p99': ev_p99, 'pt_p95': pt_p95, 'pt_p99': pt_p99, 'ped_p95': ped_p95, 'ped_p99': ped_p99, 'veh_p95': veh_p95, 'veh_p99': veh_p99, 'reg_v_p95': reg_v_p95, 'reg_v_p99': reg_v_p99,
            'ped_time_saved': ped_time_saved,
            'ped_collisions': ped_collisions,
            'starvation_events': starvation_events,
            'total_vehicle_stops': total_vehicle_stops,
            'avg_time_loss': avg_time_loss,
            'preemption_force_switches': preemption_force_switches,
            'preemption_holds': preemption_holds,
            'preemption_total': preemption_total,
            'max_queue_length': max_queue_length,
            'total_pedestrians': config.get("total_pedestrians", 0),
            'total_vehicles': config.get("total_vehicles", 0),
            'throughput': config.get("throughput", 0),
            'vehicle_type_counts': config.get("vehicle_type_counts", {}),
            'avg_ped_waiting': avg_ped_waiting,
            'avg_ped_crossing': avg_ped_crossing,
            'avg_queue_car': avg_queue_car, 'avg_crossing_car': avg_crossing_car,
            'avg_queue_truck': avg_queue_truck, 'avg_crossing_truck': avg_crossing_truck,
            'avg_queue_moto': avg_queue_moto, 'avg_crossing_moto': avg_crossing_moto,
            'avg_queue_bus': avg_queue_bus, 'avg_crossing_bus': avg_crossing_bus,
            'avg_queue_ev': avg_queue_ev, 'avg_crossing_ev': avg_crossing_ev,
            'scenario_start_datetime': _serialize_datetime(scenario_start_datetime),
            'signal_timing': {
                'scenario_start_datetime': _serialize_datetime(scenario_start_datetime),
                'ns': ns_signal_timing,
                'ew': ew_signal_timing,
            },
            'ns_green_to_red_changes': ns_signal_timing['greenToRedChanges'],
            'ew_green_to_red_changes': ew_signal_timing['greenToRedChanges'],
            'ns_green_min_duration': ns_signal_timing['durations']['green']['min'],
            'ns_green_max_duration': ns_signal_timing['durations']['green']['max'],
            'ns_yellow_min_duration': ns_signal_timing['durations']['yellow']['min'],
            'ns_yellow_max_duration': ns_signal_timing['durations']['yellow']['max'],
            'ns_red_min_duration': ns_signal_timing['durations']['red']['min'],
            'ns_red_max_duration': ns_signal_timing['durations']['red']['max'],
            'ew_green_min_duration': ew_signal_timing['durations']['green']['min'],
            'ew_green_max_duration': ew_signal_timing['durations']['green']['max'],
            'ew_yellow_min_duration': ew_signal_timing['durations']['yellow']['min'],
            'ew_yellow_max_duration': ew_signal_timing['durations']['yellow']['max'],
            'ew_red_min_duration': ew_signal_timing['durations']['red']['min'],
            'ew_red_max_duration': ew_signal_timing['durations']['red']['max'],
            'initial_green': config.get("initial_green", 0),
            'initial_yellow': config.get("initial_yellow", 0),
            'initial_red': config.get("initial_red", 0),
            'emissions': config.get("emissions", {}),
            'avg_congestion': avg_congestion,
            'avg_congestion_demand': avg_congestion_demand,
            'recovery_active_ratio': recovery_ratio,
            'avg_lane_utilization': avg_utilization,
            'queue_trend': queue_trend,
            'delay_trend': delay_trend,
            'slice_variance': slice_variance,
        })

    print(f"\n✅ All scenarios complete. Total Time: {(time.time()-total_start_time)/60:.1f}m")
    print(f"🕒 Simulation wall clock start: {wall_clock_start.strftime('%Y-%m-%d %H:%M:%S')}")

    # --- RESTRUCTURE FOR DASHBOARD ---
    dashboard_payload = []
    for stat in summary_stats:
        base = {
            'config': stat['config'],
            'Starvation Events': stat['starvation_events'],
            'MAX Queue Length': stat.get('max_queue_length', 0),
            'Total Pedestrians': stat.get('total_pedestrians', 0),
            'Total Vehicles': stat.get('total_vehicles', 0),
            'Avg Peds Waiting': stat.get('avg_ped_waiting', 0),
            'Avg Peds Crossing': stat.get('avg_ped_crossing', 0),
            'Avg Queue Car': stat.get('avg_queue_car', 0),
            'Avg Crossing Car': stat.get('avg_crossing_car', 0),
            'Avg Queue Truck': stat.get('avg_queue_truck', 0),
            'Avg Crossing Truck': stat.get('avg_crossing_truck', 0),
            'Avg Queue Moto': stat.get('avg_queue_moto', 0),
            'Avg Crossing Moto': stat.get('avg_crossing_moto', 0),
            'Avg Queue Bus': stat.get('avg_queue_bus', 0),
            'Avg Crossing Bus': stat.get('avg_crossing_bus', 0),
            'Avg Queue EV': stat.get('avg_queue_ev', 0),
            'Avg Crossing EV': stat.get('avg_crossing_ev', 0),
            'Simulation Start DateTime': _serialize_datetime(scenario_start_datetime),
            'NS Green->Red Changes': stat.get('ns_green_to_red_changes', 0),
            'EW Green->Red Changes': stat.get('ew_green_to_red_changes', 0),
            'NS Green Min Duration': stat.get('ns_green_min_duration', 0),
            'NS Green Max Duration': stat.get('ns_green_max_duration', 0),
            'NS Green Avg Duration': stat.get('signal_timing', {}).get('ns', {}).get('durations', {}).get('green', {}).get('avg', 0),
            'NS Yellow Min Duration': stat.get('ns_yellow_min_duration', 0),
            'NS Yellow Max Duration': stat.get('ns_yellow_max_duration', 0),
            'NS Yellow Avg Duration': stat.get('signal_timing', {}).get('ns', {}).get('durations', {}).get('yellow', {}).get('avg', 0),
            'NS Red Min Duration': stat.get('ns_red_min_duration', 0),
            'NS Red Max Duration': stat.get('ns_red_max_duration', 0),
            'NS Red Avg Duration': stat.get('signal_timing', {}).get('ns', {}).get('durations', {}).get('red', {}).get('avg', 0),
            'EW Green Min Duration': stat.get('ew_green_min_duration', 0),
            'EW Green Max Duration': stat.get('ew_green_max_duration', 0),
            'EW Green Avg Duration': stat.get('signal_timing', {}).get('ew', {}).get('durations', {}).get('green', {}).get('avg', 0),
            'EW Yellow Min Duration': stat.get('ew_yellow_min_duration', 0),
            'EW Yellow Max Duration': stat.get('ew_yellow_max_duration', 0),
            'EW Yellow Avg Duration': stat.get('signal_timing', {}).get('ew', {}).get('durations', {}).get('yellow', {}).get('avg', 0),
            'EW Red Min Duration': stat.get('ew_red_min_duration', 0),
            'EW Red Max Duration': stat.get('ew_red_max_duration', 0),
            'EW Red Avg Duration': stat.get('signal_timing', {}).get('ew', {}).get('durations', {}).get('red', {}).get('avg', 0),
            'throughput': stat.get('throughput', 0),
            'signal_timing': stat.get('signal_timing', {}),
            'initial_green': stat.get('initial_green', 0),
            'initial_yellow': stat.get('initial_yellow', 0),
            'initial_red': stat.get('initial_red', 0),
            'avg_time_loss': stat.get('avg_time_loss', 0),
            'total_vehicle_stops': stat.get('total_vehicle_stops', 0),
            'preemption_force_switches': stat.get('preemption_force_switches', 0),
            'preemption_holds': stat.get('preemption_holds', 0),
            'preemption_total': stat.get('preemption_total', 0),
            'Avg Congestion Level': stat.get('avg_congestion', 0),
            'Avg Congestion Level Demand': stat.get('avg_congestion_demand', 0),
            'Recovery Active Ratio': stat.get('recovery_active_ratio', 0),
            'Avg Lane Utilization': stat.get('avg_lane_utilization', 0),
            'Queue Trend': stat.get('queue_trend', 1.0),
            'Delay Trend': stat.get('delay_trend', 1.0),
            'Slice Variance': stat.get('slice_variance', 0.0),
            'ev_avg': stat.get('ev_avg', 0.0),
            'pt_avg': stat.get('pt_avg', 0.0),
            'p_avg': stat.get('p_avg', 0.0),
            'ev_p95': stat.get('ev_p95', 0.0),
            'ev_p99': stat.get('ev_p99', 0.0),
            'pt_p95': stat.get('pt_p95', 0.0),
            'pt_p99': stat.get('pt_p99', 0.0),
            'ped_p95': stat.get('ped_p95', 0.0),
            'ped_p99': stat.get('ped_p99', 0.0),
            'veh_p95': stat.get('veh_p95', 0.0),
            'veh_p99': stat.get('veh_p99', 0.0),
            'reg_v_p95': stat.get('reg_v_p95', 0.0),
            'reg_v_p99': stat.get('reg_v_p99', 0.0),
            'v_avg': stat.get('v_avg', 0.0),
        }

        em = stat.get('emissions', {})
        def get_em_stats(cat_key):
            d = em.get(cat_key, {})
            c = d.get('count', 0)
            total_co2 = em.get("net_total", {}).get("co2_g") if cat_key == "all" and "net_total" in em else (d.get('co2_mg', 0) / 1000.0)
            total_fuel = em.get("net_total", {}).get("fuel_g") if cat_key == "all" and "net_total" in em else (d.get('fuel_mg', 0) / 1000.0)
            
            return {
                'Avg CO2 (g)': (d.get('co2_mg', 0) / c / 1000.0) if c > 0 else 0.0,
                'Avg Fuel (g)': (d.get('fuel_mg', 0) / c / 1000.0) if c > 0 else 0.0,
                'Total CO2 (g)': total_co2,
                'Total Fuel (g)': total_fuel,
                'Count': c
            }

        row_all = dict(base)
        row_all.update({
            'Configuration': stat['config'],
            'Category': 'All Vehicles', 
            'User Class': 'All Vehicles',
            'Average Delay (s)': stat['all_v_avg'], 
            'Avg Delay Per Vehicle (s)': stat.get('v_life_avg', 0.0),
            'Steady-State Delay (s)': stat.get('all_v_steady_avg', 0.0),
            'Steady-State Experience (s)': stat.get('v_steady_life', 0.0),
            'Steady-State Max (s)': stat.get('all_v_steady_max', 0.0),
            'Max Delay (s)': stat['all_v_max'], 
            'Total Delay (s)': sum(r.get('all_v_wait_total', 0) for r in res),
            'P95 Delay Proxy (s)': stat.get('veh_p95', 0.0), 
            'P99 Delay Proxy (s)': stat.get('veh_p99', 0.0),
            'Count': stat.get('throughput', 0)
        })
        row_all.update(get_em_stats('all'))
        row_all['throughput'] = stat.get('throughput', 0) 
        
        dashboard_payload.append(row_all)

        row_v = dict(base)
        row_v.update({
            'Configuration': stat['config'], 
            'Category': 'Vehicle', 
            'User Class': 'Vehicle', 
            'Average Delay (s)': stat['v_avg'], 
            'Avg Delay Per Vehicle (s)': stat.get('reg_life_avg', 0.0),
            'Steady-State Delay (s)': stat.get('v_steady_avg', 0.0),
            'Steady-State Experience (s)': stat.get('reg_steady_life', 0.0),
            'Steady-State Max (s)': stat.get('v_steady_max', 0.0),
            'Max Delay (s)': stat['v_max'], 
            'Total Delay (s)': sum(r.get('v_wait_total', 0) for r in res),
            'P95 Delay Proxy (s)': stat.get('reg_v_p95', 0.0), 
            'P99 Delay Proxy (s)': stat.get('reg_v_p99', 0.0)
        })
        row_v.update(get_em_stats('regular'))
        dashboard_payload.append(row_v)

        row_ev = dict(base)
        row_ev.update({
            'Configuration': stat['config'], 
            'Category': 'Emergency', 
            'User Class': 'Emergency', 
            'Average Delay (s)': stat['ev_avg'], 
            'Avg Delay Per Vehicle (s)': stat.get('ev_life_avg', 0.0),
            'Steady-State Delay (s)': stat.get('ev_steady_avg', 0.0),
            'Steady-State Experience (s)': stat.get('ev_steady_life', 0.0),
            'Steady-State Max (s)': stat.get('ev_steady_max', 0.0),
            'Max Delay (s)': stat['ev_max'], 
            'Total Delay (s)': stat.get('ev_total', 0),
            'P95 Delay Proxy (s)': stat.get('ev_p95', 0.0), 
            'P99 Delay Proxy (s)': stat.get('ev_p99', 0.0)
        })
        row_ev.update(get_em_stats('emergency'))
        dashboard_payload.append(row_ev)

        row_pt = dict(base)
        row_pt.update({
            'Configuration': stat['config'], 
            'Category': 'PT (Bus)', 
            'User Class': 'PT (Bus)', 
            'Average Delay (s)': stat['pt_avg'], 
            'Avg Delay Per Vehicle (s)': stat.get('pt_life_avg', 0.0),
            'Steady-State Delay (s)': stat.get('pt_steady_avg', 0.0),
            'Steady-State Experience (s)': stat.get('pt_steady_life', 0.0),
            'Steady-State Max (s)': stat.get('pt_steady_max', 0.0),
            'Max Delay (s)': stat['pt_max'], 
            'Total Delay (s)': stat.get('pt_total', 0),
            'P95 Delay Proxy (s)': stat.get('pt_p95', 0.0), 
            'P99 Delay Proxy (s)': stat.get('pt_p99', 0.0)
        })
        row_pt.update(get_em_stats('bus'))
        dashboard_payload.append(row_pt)

        row_p = dict(base)
        row_p.update({
            'Configuration': stat['config'], 
            'Category': 'Pedestrian', 
            'User Class': 'Pedestrian', 
            'Average Delay (s)': stat['p_avg'], 
            'Avg Delay Per Pedestrian (s)': stat.get('p_life_avg', 0.0),
            'Steady-State Delay (s)': stat.get('p_steady_avg', 0.0),
            'Steady-State Experience (s)': stat.get('p_steady_life', 0.0),
            'Steady-State Max (s)': stat.get('p_steady_max', 0.0),
            'Max Delay (s)': stat['p_max'], 
            'P95 Delay Proxy (s)': stat['ped_p95'], 
            'P99 Delay Proxy (s)': stat.get('ped_p99', 0.0)
        })
        row_p.update({'Avg CO2 (g)': 0.0, 'Avg Fuel (g)': 0.0, 'Total CO2 (g)': 0.0, 'Total Fuel (g)': 0.0, 'Count': stat.get('total_pedestrians', 0)})
        dashboard_payload.append(row_p)


    with open(os.path.join(dashboard_root, "latest.json"), 'w') as f:
        json.dump(
            {
                "latest_run_folder": timestamp,
                "wall_clock_start": _serialize_datetime(wall_clock_start), "wall_clock_end": _serialize_datetime(datetime.now()), "scenario_start": _serialize_datetime(scenario_start_datetime), "scenario_end": _serialize_datetime(scenario_end_datetime),
                "run_type": "simulation",
                "optimization_goal": "N/A",
                "base_config_optimized": "N/A",
            },
            f,
        )

    write_dashboard_snapshot(summary_payload=dashboard_payload)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n>>> Simulation cleanly stopped by user (KeyboardInterrupt).")
