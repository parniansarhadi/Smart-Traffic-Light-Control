import subprocess
import sys
import time
import json
import os
from datetime import datetime

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

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    logs_dir = os.path.join(repo_root, "sys_output", "logs")
    os.makedirs(logs_dir, exist_ok=True)
    log_path = os.path.join(logs_dir, "full_sweep_and_compare_console.txt")
    tee = Tee(log_path, sys.stdout)
    sys.stdout = tee
    sys.stderr = tee
    
    print("="*75)
    print("🚀 PHASE 1 & 2: RUNNING AUTOMATED MULTI-GOAL OPTIMIZATION SWEEP")
    print("Horizons: Phase 1 = 720s | Phase 2 = 1800s")
    print("="*75)
    
    # Run Optimization Sweep
    opt_cmd = [
        sys.executable,
        os.path.join(repo_root, "sim_unit", "optimization", "run_Optimization.py"),
        "--mode", "real",
        "--real-traffic-source", "stream",
        "--phase1-sim-time", "720",
        "--phase2-sim-time", "1800",
        "--phase1-per-stage", "3",
        "--max-phase2-candidates", "3",
        "--skip-final-run"
    ]
    
    print(f"Executing Optimizer Sweep: {' '.join(opt_cmd)}\n")
    process = subprocess.Popen(opt_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in process.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
    process.wait()
    
    if process.returncode != 0:
        print("\n❌ Optimization sweep failed! Aborting comparison.")
        sys.exit(process.returncode)
        
    print("\n" + "="*75)
    print("🚦 PHASE 3: RUNNING SIMULATION COMPARISON ACROSS ALL OPTIMIZED GOALS")
    print("Simulating Baseline + All 7 Goals one by one (Horizon: 720s)")
    print("="*75)
    
    # Run Simulation on all goals
    sim_cmd = [
        sys.executable,
        "-m", "sim_unit.core.main",
        "--mode", "real",
        "--real-traffic-source", "stream",
        "--sim-time", "720",
        "--goal-profiles"
    ]
    
    print(f"Executing Simulation Comparison: {' '.join(sim_cmd)}\n")
    process = subprocess.Popen(sim_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in process.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
    process.wait()
    
    if process.returncode != 0:
        print("\n❌ Simulation comparison failed!")
        sys.exit(process.returncode)
        
    # Extract and Store Comparison Results
    dashboard_root = os.path.join(repo_root, "sys_output", "dashboard_data")
    latest_json_path = os.path.join(dashboard_root, "latest.json")
    
    if not os.path.exists(latest_json_path):
        print(f"\n❌ Could not find latest.json at {latest_json_path}")
        sys.exit(1)
        
    with open(latest_json_path, "r") as f:
        latest_meta = json.load(f)
        
    run_folder = latest_meta.get("latest_run_folder")
    summary_path = os.path.join(dashboard_root, run_folder, "summary.json")
    
    if not os.path.exists(summary_path):
        print(f"\n❌ Could not find summary.json at {summary_path}")
        sys.exit(1)
        
    with open(summary_path, "r") as f:
        summary_data = json.load(f)
        
    # Build clean comparative JSON
    comparison_results = {
        "timestamp": datetime.now().isoformat(),
        "optimization_horizons": {"phase1": 720, "phase2": 1800},
        "simulation_comparison_horizon": 720,
        "results_by_goal": {}
    }
    
    # Group results by configuration name
    configs = {}
    for entry in summary_data:
        cfg_name = entry.get("config", entry.get("Configuration"))
        if not cfg_name:
            continue
        cat = entry.get("Category", "Vehicle")
        if cfg_name not in configs:
            configs[cfg_name] = {}
        configs[cfg_name][cat] = entry
        
    for cfg_name, cats in configs.items():
        veh = cats.get("Vehicle", {})
        ped = cats.get("Pedestrian", {})
        ev = cats.get("Emergency", {})
        pt = cats.get("PT (Bus)", {})
        
        goal_key = cfg_name.replace("Adaptive Goal ", "").replace("Fixed No Preempt", "baseline").lower()
        
        comparison_results["results_by_goal"][goal_key] = {
            "display_name": cfg_name,
            "categories": {
                "vehicle": veh,
                "emergency": ev,
                "pt_bus": pt,
                "pedestrian": ped
            }
        }
        
    output_json_path = os.path.join(dashboard_root, "goals_comparison_results.json")
    with open(output_json_path, "w") as f:
        json.dump(comparison_results, f, indent=4)
        
    print("\n" + "="*75)
    print(f"📊 COMPARISON RESULTS SAVED SUCCESSFULLY TO:\n📁 {output_json_path}")
    print("="*75)
    
    print(f"\n{'GOAL / CONFIG':<22} | {'THROUGHPUT':<10} | {'AVG DELAY':<10} | {'MAX DELAY':<10} | {'STOPS':<6} | {'PED WAIT':<8} | {'CHANGES':<8} | {'NS GREEN (Min/Avg/Max)':<22}")
    print("-" * 115)
    for g_key, goal_data in comparison_results["results_by_goal"].items():
        name = goal_data["display_name"]
        veh_cat = goal_data["categories"]["vehicle"]
        ped_cat = goal_data["categories"]["pedestrian"]
        
        tp = veh_cat.get("throughput", 0)
        dly = f"{veh_cat.get('Average Delay (s)', 0.0):.1f}s"
        max_d = f"{veh_cat.get('Max Delay (s)', 0.0):.1f}s"
        stops = veh_cat.get("Total Stops", 0)
        ped_w = f"{ped_cat.get('Average Delay (s)', 0.0):.1f}s"
        
        changes = veh_cat.get("NS Green->Red Changes", 0)
        g_min = veh_cat.get("NS Green Min Duration", 0.0)
        g_avg = veh_cat.get("NS Green Avg Duration", 0.0)
        g_max = veh_cat.get("NS Green Max Duration", 0.0)
        green_str = f"{g_min:.0f}s / {g_avg:.1f}s / {g_max:.0f}s"
        
        print(f"{name:<22} | {tp:<10} | {dly:<10} | {max_d:<10} | {stops:<6} | {ped_w:<8} | {changes:<8} | {green_str:<22}")
    print("="*115 + "\n")

if __name__ == "__main__":
    main()
