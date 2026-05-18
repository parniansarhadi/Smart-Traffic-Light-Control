import subprocess
import sys
import time
import json
import os

ALL_GOALS = [
    "balanced",
    "eco",
    "throughput",
    "ev_focus",
    "ped_focus",
    "fluidity",
    "low_congestion",
    "veh_focus",
    "ped_veh_focus"
]

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
    repo_root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    logs_dir = os.path.join(repo_root_dir, "sys_output", "logs")
    os.makedirs(logs_dir, exist_ok=True)
    log_path = os.path.join(logs_dir, "optimization_sweep_console.txt")
    tee = Tee(log_path, sys.stdout)
    sys.stdout = tee
    sys.stderr = tee

    base_args = sys.argv[1:]
    if not base_args:
        base_args = [
            "--mode", "real",
            "--real-traffic-source", "stream",
            "--phase1-sim-time", "180",
            "--phase2-sim-time", "360",
            "--phase1-per-stage", "3",
            "--max-phase2-candidates", "3",
            "--skip-final-run",
            "--restore-original-config"
        ]
        config_str = "Mode: REAL | Traffic Source: STREAM | Horizons: 180s / 360s (Default Fast Sweep)"
    else:
        while "--goal" in base_args:
            idx = base_args.index("--goal")
            base_args.pop(idx)
            if idx < len(base_args):
                base_args.pop(idx)
        if "--phase1-per-stage" not in base_args:
            base_args.extend(["--phase1-per-stage", "3"])
        if "--max-phase2-candidates" not in base_args:
            base_args.extend(["--max-phase2-candidates", "3"])
        if "--skip-final-run" not in base_args:
            base_args.append("--skip-final-run")
        if "--restore-original-config" not in base_args:
            base_args.append("--restore-original-config")
        config_str = f"Custom Hub Flags: {' '.join(base_args)}"

    print("="*70)
    print("🚀 STARTING AUTOMATED SHORT OPTIMIZATION SWEEP ACROSS ALL GOALS")
    print(config_str)
    print("="*70)

    total_start = time.time()
    results_summary = {}

    for idx, goal in enumerate(ALL_GOALS, start=1):
        print(f"\n>>> [{idx}/{len(ALL_GOALS)}] RUNNING OPTIMIZATION FOR GOAL: {goal.upper()}")
        t0 = time.time()
        
        cmd = [sys.executable, "-m", "sim_unit.optimization.rapid_grid_search"] + base_args + ["--goal", goal]

        print(f"Executing: {' '.join(cmd)}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        # Stream output
        for line in process.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            
        process.wait()
        elapsed = time.time() - t0
        
        if process.returncode == 0:
            print(f"✅ Goal {goal.upper()} completed successfully in {elapsed:.1f}s.")
            results_summary[goal] = "SUCCESS"
        else:
            print(f"❌ Goal {goal.upper()} failed with exit code {process.returncode}.")
            results_summary[goal] = "FAILED"

    print("\n" + "="*70)
    print("🏆 ALL GOALS OPTIMIZATION SWEEP COMPLETE!")
    print(f"Total Sweep Time: {(time.time() - total_start)/60:.1f} minutes")
    print("="*70)
    
    # Verify optimization_config.json
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    opt_config_path = os.path.join(repo_root, "input_data", "sys_config", "optimization_config.json")
    if os.path.exists(opt_config_path):
        try:
            with open(opt_config_path, "r") as f:
                opt_data = json.load(f)
            stored_goals = list(opt_data.get("optimized_profiles_by_goal", {}).keys())
            print(f"\n📁 Verified optimization_config.json.")
            print(f"Successfully stored optimized profiles for goals: {stored_goals}")
        except Exception as e:
            print(f"❌ Failed to read optimization_config.json: {e}")

    # Update latest.json
    latest_json_path = os.path.join(repo_root, "sys_output", "dashboard_data", "latest.json")
    if os.path.exists(latest_json_path):
        try:
            with open(latest_json_path, "r") as f:
                latest_meta = json.load(f)
            latest_meta["run_type"] = "single optimization"
            latest_meta["optimization_goal"] = "all"
            latest_meta["base_config_optimized"] = "all"
            with open(latest_json_path, "w") as f:
                json.dump(latest_meta, f, indent=4)
        except Exception as e:
            pass

if __name__ == "__main__":
    main()
