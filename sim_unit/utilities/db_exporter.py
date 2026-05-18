import os
import json
from datetime import datetime
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from pathlib import Path

class MongoResultsExporter:
    def __init__(self, uri: str = None):
        self.uri = uri or "mongodb+srv://<username>:<pass>@simdb.ur42hy8.mongodb.net/?appName=simDB"
        self.client = None
        self.db = None
        self.collection = None

    def connect(self, db_name="sim_results_db", collection_name="sim_runs"):
        try:
            self.client = MongoClient(self.uri, server_api=ServerApi('1'))
            self.client.admin.command('ping')
            self.db = self.client[db_name]
            self.collection = self.db[collection_name]
            return True, "Successfully connected to MongoDB Atlas."
        except Exception as e:
            return False, f"Connection failed: {str(e)}"

    def upload_run_results(self, run_folder_path: Path, metadata: dict = None):
        """
        Gathers files from the run folder and uploads them as a single document.
        """
        if self.collection is None:
            return False, "Not connected to database."

        try:
            files_to_load = {
                "summary": "summary.json",
                "history": "history.json",
                "network_config": "network_layout.json",
                "system_config": "system_param.json"
            }
            
            master_document = {
                "upload_timestamp": datetime.now().isoformat(),
                "run_id": run_folder_path.name,
                "metadata": metadata or {},
                "chunk_index": 0,
                "total_chunks": 1,
                "data": {}
            }

            summary_path = run_folder_path / "summary.json"
            if summary_path.exists():
                with open(summary_path, 'r') as f:
                    master_document["data"]["summary"] = json.load(f)

            history_path = run_folder_path / "history.json"
            if history_path.exists():
                with open(history_path, 'r') as f:
                    master_document["data"]["history"] = json.load(f)
            latest_path = run_folder_path.parent / "latest.json"
            if latest_path.exists():
                with open(latest_path, 'r') as f:
                    master_document["data"]["run_metadata"] = json.load(f)
            workspace_root = run_folder_path.parent.parent.parent

            net_paths = [
                workspace_root / "sumo_config" / "network_layout.json",
                workspace_root / "input_data" / "sys_config" / "network_layout_config.json"
            ]
            for idx, net_path in enumerate(net_paths):
                if net_path.exists():
                    with open(net_path, 'r') as f:
                        master_document["data"][f"network_config{'' if idx == 0 else '_sys'}"] = json.load(f)

            sys_paths = [
                workspace_root / "sumo_config" / "system_param.json",
                workspace_root / "input_data" / "sys_config" / "system_param_config.json"
            ]
            for idx, sys_path in enumerate(sys_paths):
                if sys_path.exists():
                    with open(sys_path, 'r') as f:
                        master_document["data"][f"system_config{'' if idx == 0 else '_sys'}"] = json.load(f)

            opt_path = workspace_root / "input_data" / "sys_config" / "optimization_config.json"
            if opt_path.exists():
                with open(opt_path, 'r') as f:
                    master_document["data"]["optimization_config_sys"] = json.load(f)

            goals_comp_path = workspace_root / "sys_output" / "dashboard_data" / "goals_comparison_results.json"
            if goals_comp_path.exists():
                with open(goals_comp_path, 'r') as f:
                    master_document["data"]["goals_comparison_results"] = json.load(f)

            matrix_path = workspace_root / "sys_output" / "dashboard_data" / "multi_goal_matrix_results.json"
            if matrix_path.exists():
                with open(matrix_path, 'r') as f:
                    master_document["data"]["multi_goal_matrix_results"] = json.load(f)

            chunk_documents = []
            hbm_path = run_folder_path / "history_by_mode.json"
            if hbm_path.exists():
                with open(hbm_path, 'r') as f:
                    hbm_data = json.load(f)
                    if isinstance(hbm_data, dict):
                        modes = list(hbm_data.keys())
                        batch_size = 5
                        mode_batches = [modes[i:i + batch_size] for i in range(0, len(modes), batch_size)]
                        
                        master_document["total_chunks"] = len(mode_batches)
                        master_document["data"]["history_by_mode"] = {m: hbm_data[m] for m in mode_batches[0]} if mode_batches else {}

                        for batch_idx, mode_batch in enumerate(mode_batches[1:], start=1):
                            chunk_doc = {
                                "upload_timestamp": master_document["upload_timestamp"],
                                "run_id": master_document["run_id"],
                                "metadata": master_document["metadata"],
                                "chunk_index": batch_idx,
                                "total_chunks": master_document["total_chunks"],
                                "data": {
                                    "history_by_mode": {m: hbm_data[m] for m in mode_batch}
                                }
                            }
                            chunk_documents.append(chunk_doc)

            res_master = self.collection.insert_one(master_document)
            if chunk_documents:
                self.collection.insert_many(chunk_documents)
                
            return True, f"Successfully uploaded run {run_folder_path.name} in {master_document['total_chunks']} batches (Master ID: {res_master.inserted_id})"

        except Exception as e:
            return False, f"Upload failed: {str(e)}"

def export_latest_run():
    workspace_root = Path(__file__).parent.parent.parent
    output_dir = workspace_root / "sys_output" / "dashboard_data"
    
    # Read latest.json to find the latest folder
    latest_json_path = output_dir / "latest.json"
    if not latest_json_path.exists():
        return {"status": "error", "message": "No latest.json found. Run a simulation first."}

    with open(latest_json_path, 'r') as f:
        latest_info = json.load(f)
    
    latest_folder_name = latest_info.get("latest_run_folder")
    if not latest_folder_name:
        return {"status": "error", "message": "No latest_run_folder found in latest.json."}

    run_folder_path = output_dir / latest_folder_name
    if not run_folder_path.exists():
        return {"status": "error", "message": f"Run folder {latest_folder_name} not found."}

    exporter = MongoResultsExporter()
    success, msg = exporter.connect()
    if not success:
        return {"status": "error", "message": msg}

    ok, export_msg = exporter.upload_run_results(run_folder_path, metadata=latest_info)
    if not ok:
        return {"status": "error", "message": export_msg}

    return {"status": "success", "message": export_msg}
