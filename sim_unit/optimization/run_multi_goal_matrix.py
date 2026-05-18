import subprocess
import sys
import time
import json
import os
from datetime import datetime

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    print("="*75)
    print("🚀 PHASE 1: RUNNING 48-MODE MULTI-GOAL SIMULATION MATRIX")
    print("Simulating 6 default configurations across Baseline + All 7 Goals (Horizon: 720s)")
    print("="*75)
    
    if "--parse-only" not in sys.argv:
        sim_time = "720"
        if "--sim-time" in sys.argv:
            idx = sys.argv.index("--sim-time")
            if idx + 1 < len(sys.argv):
                sim_time = sys.argv[idx + 1]

        sim_cmd = [
            sys.executable,
            "-m", "sim_unit.core.main",
            "--mode", "real",
            "--real-traffic-source", "stream",
            "--goal-matrix"
        ]
        if sim_time != "all":
            sim_cmd.extend(["--sim-time", sim_time])
        
        print(f"Executing Matrix Simulation: {' '.join(sim_cmd)}\n")
        process = subprocess.Popen(sim_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
        process.wait()
        
        if process.returncode != 0:
            print("\n❌ Matrix simulation failed!")
            sys.exit(process.returncode)
    else:
        print("⚡ --parse-only flag detected: Skipping simulation and re-parsing existing matrix summary.json")
        
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
        
    opt_cfg_path = os.path.join(repo_root, "input_data", "sys_config", "optimization_config.json")
    opt_data = {}
    if os.path.exists(opt_cfg_path):
        try:
            with open(opt_cfg_path, "r") as f:
                opt_data = json.load(f)
        except Exception:
            pass
            
    goals_dict = opt_data.get("optimized_profiles_by_goal", {})
    
    # Build clean comparative JSON
    matrix_results = {
        "timestamp": datetime.now().isoformat(),
        "optimization_horizons": {"phase1": 720, "phase2": 1800},
        "simulation_horizon": sim_time if sim_time != "all" else "all",
        "goals": {}
    }
    
    # Initialize goals structure
    matrix_results["goals"]["baseline"] = {
        "display_name": "System Baseline",
        "config_name": "fixed_no_preempt",
        "profile": {},
        "configurations": {}
    }
    
    for g_name, g_data in goals_dict.items():
        matrix_results["goals"][g_name] = {
            "display_name": f"Adaptive Goal {g_name.title()}",
            "config_name": g_data.get("name", f"adaptive_{g_name}"),
            "profile": g_data.get("profile", {}),
            "configurations": {}
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
        
        goal_key = None
        mode_key = None
        
        norm_cfg = cfg_name.lower().replace(" ", "_")
        
        if norm_cfg.startswith("baseline_"):
            goal_key = "baseline"
            mode_key = norm_cfg.replace("baseline_", "")
        elif norm_cfg.startswith("goal_"):
            for possible_mode in ["fixed_no_preempt", "fixed_with_preempt", "adaptive_no_preempt", "adaptive_weighted", "adaptive_with_preempt", "adaptive_weighted_with_preempt"]:
                if norm_cfg.endswith("_" + possible_mode):
                    mode_key = possible_mode
                    goal_key = norm_cfg[len("goal_") : -len("_" + possible_mode)]
                    break
                    
        if goal_key and mode_key:
            if goal_key not in matrix_results["goals"]:
                matrix_results["goals"][goal_key] = {
                    "display_name": f"Adaptive Goal {goal_key.title()}",
                    "profile": {},
                    "configurations": {}
                }
            matrix_results["goals"][goal_key]["configurations"][mode_key] = {
                "vehicle": veh,
                "emergency": ev,
                "pt_bus": pt,
                "pedestrian": ped
            }
            
    output_json_path = os.path.join(dashboard_root, "multi_goal_matrix_results.json")
    with open(output_json_path, "w") as f:
        json.dump(matrix_results, f, indent=4)
        
    # Update latest.json
    if os.path.exists(latest_json_path):
        try:
            with open(latest_json_path, "r") as f:
                latest_meta = json.load(f)
            latest_meta["run_type"] = "full optimization"
            latest_meta["optimization_goal"] = "all"
            latest_meta["base_config_optimized"] = "all"
            with open(latest_json_path, "w") as f:
                json.dump(latest_meta, f, indent=4)
        except Exception as e:
            pass

    print("\n" + "="*75)
    print(f"📊 MULTI-GOAL MATRIX RESULTS SAVED SUCCESSFULLY TO:\n📁 {output_json_path}")
    print("="*75 + "\n")

if __name__ == "__main__":
    main()
