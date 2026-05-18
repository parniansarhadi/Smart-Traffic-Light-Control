from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import json
import re
from pathlib import Path
from pydantic import BaseModel

try:
    from ..utilities.path_utils import get_sys_output_dir, get_workspace_root
except ImportError:
    from utilities.path_utils import get_sys_output_dir, get_workspace_root

app = FastAPI()

# Allow Next.js frontend to communicate with API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Automatically resolve absolute path to dashboard data directory.
BASE_DIR = Path(get_workspace_root(__file__))
DATA_DIR = Path(get_sys_output_dir(BASE_DIR)) / "dashboard_data"


def _count_vehicle_types_from_routes(route_path: Path) -> dict[str, int]:
    if not route_path.exists():
        return {}

    xml = route_path.read_text()
    counts: dict[str, int] = {}

    for match in re.finditer(r"<(vehicle|trip)\b([^>]*)>", xml):
        attrs = match.group(2) or ""
        type_match = re.search(r'\btype="([^"]+)"', attrs, re.IGNORECASE)
        vehicle_type = (type_match.group(1) if type_match else "unknown").strip().lower()
        counts[vehicle_type] = counts.get(vehicle_type, 0) + 1

    return counts


def _count_pedestrians_from_routes(*route_paths: Path) -> int:
    """Count <person> tags across one or more route XML files."""
    total = 0
    for route_path in route_paths:
        if not route_path.exists():
            continue
        xml = route_path.read_text()
        total += len(re.findall(r'<person\b', xml))
    return total


def _estimate_flow_count(flow_attrs: str) -> int:
    begin_match = re.search(r'\bbegin="([0-9.]+)"', flow_attrs, re.IGNORECASE)
    end_match = re.search(r'\bend="([0-9.]+)"', flow_attrs, re.IGNORECASE)
    begin = float(begin_match.group(1)) if begin_match else 0.0
    end = float(end_match.group(1)) if end_match else 0.0
    duration = max(0.0, end - begin)

    number_match = re.search(r'\bnumber="([0-9.]+)"', flow_attrs, re.IGNORECASE)
    if number_match:
        return max(0, round(float(number_match.group(1))))

    probability_match = re.search(r'\bprobability="([0-9.]+)"', flow_attrs, re.IGNORECASE)
    if probability_match:
        probability = float(probability_match.group(1))
        if probability >= 0:
            return max(0, round(duration * probability))

    vehs_per_hour_match = re.search(r'\bvehsPerHour="([0-9.]+)"', flow_attrs, re.IGNORECASE)
    if vehs_per_hour_match:
        vehs_per_hour = float(vehs_per_hour_match.group(1))
        if vehs_per_hour >= 0:
            return max(0, round((duration / 3600.0) * vehs_per_hour))

    period_match = re.search(r'\bperiod="([0-9.]+)"', flow_attrs, re.IGNORECASE)
    if period_match:
        period = float(period_match.group(1))
        if period > 0:
            return max(0, round(duration / period))

    return 0


def _count_vehicle_types_from_flows(flow_path: Path) -> dict[str, int]:
    if not flow_path.exists():
        return {}

    xml = flow_path.read_text()
    counts: dict[str, int] = {}

    for match in re.finditer(r"<flow\b([^>]*)>", xml):
        attrs = match.group(1) or ""
        type_match = re.search(r'\btype="([^"]+)"', attrs, re.IGNORECASE)
        vehicle_type = (type_match.group(1) if type_match else "unknown").strip().lower()
        estimated = _estimate_flow_count(attrs)
        if estimated <= 0:
            continue
        counts[vehicle_type] = counts.get(vehicle_type, 0) + estimated

    return counts


def _merge_vehicle_type_counts(*count_maps: dict[str, int]) -> list[dict[str, int | str]]:
    merged: dict[str, int] = {}
    for count_map in count_maps:
        for vehicle_type, count in count_map.items():
            merged[vehicle_type] = merged.get(vehicle_type, 0) + count

    return [
        {"type": vehicle_type, "count": count}
        for vehicle_type, count in sorted(merged.items(), key=lambda item: item[1], reverse=True)
    ]


def _resolve_latest_run_folder(data_dir: Path) -> str:
    latest_path = data_dir / "latest.json"
    if latest_path.exists():
        with open(latest_path, "r") as f:
            latest_info = json.load(f)
        latest_folder = latest_info.get("latest_run_folder")
        if latest_folder:
            return latest_folder

    # Fallback: choose the newest timestamped run directory.
    run_dirs = [p for p in data_dir.iterdir() if p.is_dir()]
    if not run_dirs:
        raise FileNotFoundError(
            "No simulation data available. Please run a traffic simulation or optimization from the Control Hub to generate dashboard analytics."
        )

    return sorted(run_dirs, key=lambda p: p.name)[-1].name

@app.get("/api/dashboard-data")
def get_latest_data():
    try:
        if not DATA_DIR.exists():
            raise FileNotFoundError("No simulation data available. Please run a traffic simulation or optimization from the Control Hub to generate dashboard analytics.")

        # Resolve the latest run folder and extra metadata
        latest_path = DATA_DIR / "latest.json"
        wall_clock_start = None
        wall_clock_end = None
        scenario_start = None
        scenario_end = None
        latest_folder = _resolve_latest_run_folder(DATA_DIR)
        
        if latest_path.exists():
            with open(latest_path, "r") as f:
                latest_info = json.load(f)
                latest_folder = latest_info.get("latest_run_folder", latest_folder)
                wall_clock_start = latest_info.get("wall_clock_start")
                wall_clock_end = latest_info.get("wall_clock_end")
                scenario_start = latest_info.get("scenario_start")
                scenario_end = latest_info.get("scenario_end")
                run_type = latest_info.get("run_type", "simulation")
                optimization_goal = latest_info.get("optimization_goal", "N/A")
                base_config_optimized = latest_info.get("base_config_optimized", "N/A")
        else:
            run_type = "simulation"
            optimization_goal = "N/A"
            base_config_optimized = "N/A"

        run_path = DATA_DIR / latest_folder

        # Load Summary
        with open(run_path / "summary.json", "r") as f:
            summary_data = json.load(f)

        route_vehicle_types = _count_vehicle_types_from_routes(BASE_DIR / "sumo_config" / "routes.rou.xml")
        flow_vehicle_types = _count_vehicle_types_from_flows(BASE_DIR / "sumo_config" / "flows.rou.xml")
        all_vehicle_types = _merge_vehicle_type_counts(route_vehicle_types, flow_vehicle_types)
        # Count pedestrians from route XML files as fallback
        ped_from_routes = _count_pedestrians_from_routes(
            BASE_DIR / "sumo_config" / "routes.rou.xml",
            BASE_DIR / "sumo_config" / "p_routes.rou.xml"
        )
        
        fallback_vehicles = sum(row["count"] for row in all_vehicle_types)
        total_vehicles = fallback_vehicles
        total_pedestrians = ped_from_routes
        
        if isinstance(summary_data, list) and len(summary_data) > 0:
            # Safely grab the max spawned values from the summary output
            max_spawned_veh = max([row.get("total_vehicles", 0) for row in summary_data])
            max_spawned_ped = max([row.get("total_pedestrians", 0) for row in summary_data])
            if max_spawned_veh > 0:
                total_vehicles = max_spawned_veh
            if max_spawned_ped > 0:
                total_pedestrians = max_spawned_ped

        # Load per-mode history if available; otherwise fallback to legacy single history.
        history_by_mode_path = run_path / "history_by_mode.json"
        if history_by_mode_path.exists():
            with open(history_by_mode_path, "r") as f:
                history_by_mode_data = json.load(f)
        else:
            with open(run_path / "history.json", "r") as f:
                history_data = json.load(f)
            history_by_mode_data = {"Current Run": history_data}

        history_data = history_by_mode_data.get("Current Run")
        if history_data is None:
            history_data = next(iter(history_by_mode_data.values()), [])

        return {
            "status": "success",
            "timestamp": latest_folder,
            "wallClockStart": wall_clock_start,
            "wallClockEnd": wall_clock_end,
            "scenarioStart": scenario_start,
            "scenarioEnd": scenario_end,
            "runType": run_type,
            "optimizationGoal": optimization_goal,
            "baseConfigOptimized": base_config_optimized,
            "summary": summary_data,
            "history": history_data,
            "history_by_mode": history_by_mode_data,
            "section1": {
                "totalVehicles": total_vehicles,
                "totalPedestrians": total_pedestrians,
                "vehicleTypes": all_vehicle_types,
            },
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ... GET endpoint ...

class OverrideRequest(BaseModel):
    intersection_id: str
    action: str

@app.post("/api/override")
def apply_manual_override(req: OverrideRequest):
    print(f"Received Override: Intersection {req.intersection_id}, Action: {req.action}")
    
    return {
        "status": "success", 
        "message": f"Applied {req.action} to {req.intersection_id}"
    }

class FetchDataRequest(BaseModel):
    start_dt: str
    end_dt: str

@app.post("/api/fetch-db-data")
def fetch_db_data(req: FetchDataRequest):
    try:
        from utilities.db_importer import fetch_traffic_window
    except ImportError:
        from ..utilities.db_importer import fetch_traffic_window
        
    result = fetch_traffic_window(req.start_dt, req.end_dt)
    return result

@app.post("/api/export-latest-run")
def export_latest_run_api():
    try:
        from utilities.db_exporter import export_latest_run
    except ImportError:
        from ..utilities.db_exporter import export_latest_run
        
    result = export_latest_run()
    return result

@app.post("/api/cloud-results")
def fetch_cloud_results_api():
    try:
        from utilities.db_importer import get_cloud_results
    except ImportError:
        from ..utilities.db_importer import get_cloud_results
        
    result = get_cloud_results()
    return result
    
@app.post("/api/download-cloud-run")
def download_cloud_run_api(req: dict):
    run_id = req.get("run_id")
    if not run_id:
        return {"status": "error", "message": "Missing run_id"}
    try:
        from utilities.db_importer import download_cloud_run
    except ImportError:
        from ..utilities.db_importer import download_cloud_run
        
    result = download_cloud_run(run_id)
    return result

@app.post("/api/delete-cloud-run")
def delete_cloud_run_api(req: dict):
    run_id = req.get("run_id")
    if not run_id:
        return {"status": "error", "message": "Missing run_id"}
    try:
        from utilities.db_importer import delete_cloud_run
    except ImportError:
        from ..utilities.db_importer import delete_cloud_run
        
    result = delete_cloud_run(run_id)
    return result

