import os
import re
import json
import shutil
from datetime import datetime, timezone
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from pathlib import Path

class MongoTrafficImporter:
    def __init__(self, uri: str = None):
        self.uri = uri or "mongodb+srv://<username>:<pass>@cluster0.epb2tkz.mongodb.net/?appName=Cluster0"
        self.client = None
        self.db = None
        self.collection = None

    def connect(self, db_name="traffic_data", collection_name="intersection_logs"):
        try:
            self.client = MongoClient(self.uri, server_api=ServerApi('1'))
            self.client.admin.command('ping')
            self.db = self.client[db_name]
            self.collection = self.db[collection_name]
            return True, "Successfully connected to MongoDB Atlas."
        except Exception as e:
            return False, f"Connection failed: {str(e)}"

    def fetch_data(self, start_iso: str, end_iso: str):
        if self.collection is None:
            return None, "Not connected to database."

        def _parse_dt(s: str):
            if not s: return None
            
            clean = s.replace('Z', '').replace('T', ' ').strip()
            clean = re.sub(r'([AP]M)[:\s]*\d*', r' \1', clean, flags=re.I)
            clean = re.sub(r'\s+', ' ', clean).strip() 

            if not re.search(r"\b\d{4}\b", clean):
                current_year = str(datetime.now().year)
                if '/' in clean: clean = f"{clean}/{current_year}"
                elif '-' in clean: clean = f"{clean}-{current_year}"
                else: clean = f"{clean} {current_year}"

            patterns = [
                "%Y-%m-%d %I:%M:%S %p", "%Y-%m-%d %I:%M %p",
                "%m/%d/%Y %I:%M:%S %p", "%m/%d/%Y %I:%M %p",
                "%Y-%m-%d %H:%M:%S",    "%Y-%m-%d %H:%M",
                "%m/%d/%Y %H:%M:%S",    "%m/%d/%Y %H:%M",
                "%Y-%m-%d",             "%m/%d/%Y",        
            ]

            try:
                dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
                if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except:
                pass

            for fmt in patterns:
                try:
                    dt = datetime.strptime(clean, fmt)
                    return dt.replace(tzinfo=timezone.utc)
                except:
                    continue
            return None

        start_dt = _parse_dt(start_iso)
        end_dt   = _parse_dt(end_iso)

        if not start_dt or not end_dt:
            return None, (
                f"Could not understand the date/time range.\n"
                f"Received: Start='{start_iso}', End='{end_iso}'\n"
                "Please use formats like YYYY-MM-DD HH:MM or M/D HH:MM AM/PM."
            )


        start_iso_norm = start_dt.isoformat().replace('+00:00', 'Z')
        end_iso_norm   = end_dt.isoformat().replace('+00:00', 'Z')

        query = {
            "$or": [
                {"datetime": {"$gte": start_dt, "$lte": end_dt, "$type": "date"}},
                {"datetime": {"$gte": start_iso_norm, "$lte": end_iso_norm, "$type": "string"}}
            ]
        }

        try:
            cursor = self.collection.find(query).sort("datetime", 1)
            raw_results = list(cursor)
            
            final_results = []
            for doc in raw_results:
                val = doc.get("datetime")
                if not val: continue
                
                rec_dt = val if isinstance(val, datetime) else _parse_dt(val)
                if rec_dt:
                    if rec_dt.tzinfo is None: rec_dt = rec_dt.replace(tzinfo=timezone.utc)
                    if start_dt <= rec_dt <= end_dt:
                        final_results.append(doc)

            if not final_results:
                return None, "No data found in the database for the specified temporal window."

            actual_start = final_results[0].get("datetime")
            actual_end   = final_results[-1].get("datetime")
            
            if isinstance(actual_start, str): actual_start = _parse_dt(actual_start)
            if isinstance(actual_end, str):   actual_end   = _parse_dt(actual_end)

            requested_duration = (end_dt - start_dt).total_seconds()
            actual_duration    = (actual_end - actual_start).total_seconds()
            
            start_gap = (actual_start - start_dt).total_seconds()
            end_gap   = (end_dt - actual_end).total_seconds()

            if requested_duration > 60 and (actual_duration / requested_duration < 0.8 or start_gap > 900 or end_gap > 900):
                return None, (
                    f"Insufficient data coverage for the requested window.\n"
                    f"Requested: {start_dt.strftime('%H:%M')} to {end_dt.strftime('%H:%M')}\n"
                    f"Available: {actual_start.strftime('%H:%M')} to {actual_end.strftime('%H:%M')}\n"
                    f"The database only contains data for {int(actual_duration/60)} minutes of that {int(requested_duration/60)} minute window."
                )
            
            return self._process_results(final_results), None
        except Exception as e:
            return None, f"Database error: {str(e)}"


    def _process_results(self, results):
        for doc in results:
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            if isinstance(doc.get("datetime"), datetime):
                doc["datetime"] = doc["datetime"].isoformat()
        return results

    def save_to_json(self, data, output_path: str):
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, 'w') as f:
                json.dump(data, f, indent=4)
            return True, f"Data saved to {output_path}"
        except Exception as e:
            return False, f"Failed to save JSON: {str(e)}"

class MongoResultsImporter:
    def __init__(self, uri: str = None):
        self.uri = uri or "mongodb+srv://s342417_db_user:65WzSzIswIgCdMVk@simdb.ur42hy8.mongodb.net/?appName=simDB"
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

    def fetch_all_results(self):
        if self.collection is None:
            return None, "Not connected to database."
        try:
            # ONLY fetch master documents
            cursor = self.collection.find(
                {"$or": [{"chunk_index": 0}, {"chunk_index": {"$exists": False}}]},
                {"data": 0}
            ).sort("upload_timestamp", -1)
            raw_results = list(cursor)
            
            # Deduplicate by run_id
            seen_run_ids = set()
            deduped_results = []
            for doc in raw_results:
                if "_id" in doc:
                    doc["_id"] = str(doc["_id"])
                r_id = doc.get("run_id")
                if r_id and r_id not in seen_run_ids:
                    seen_run_ids.add(r_id)
                    deduped_results.append(doc)
                    
            return deduped_results, None
        except Exception as e:
            return None, f"Fetch failed: {str(e)}"

    def fetch_single_result(self, run_id: str):
        """
        Fetches all chunks for a specific run_id and merges their data payloads back together.
        """
        if self.collection is None:
            return None, "Not connected to database."
        try:
            # Fetch all documents matching run_id
            cursor = self.collection.find({"run_id": run_id})
            docs = list(cursor)
            if not docs:
                return None, None
            
            # Sort docs by chunk_index
            docs.sort(key=lambda x: x.get("chunk_index", 0))
            
            # Master document is the first one (chunk_index: 0)
            master_doc = docs[0]
            if "_id" in master_doc:
                master_doc["_id"] = str(master_doc["_id"])
                
            # If there are multiple chunks, merge their data["history_by_mode"] into master_doc
            if len(docs) > 1:
                if "history_by_mode" not in master_doc["data"]:
                    master_doc["data"]["history_by_mode"] = {}
                for child in docs[1:]:
                    child_hbm = child.get("data", {}).get("history_by_mode", {})
                    master_doc["data"]["history_by_mode"].update(child_hbm)
                    
            return master_doc, None
        except Exception as e:
            return None, f"Fetch failed: {str(e)}"

    def delete_single_result(self, run_id: str):
        """
        Deletes all chunks for a specific run_id.
        """
        if self.collection is None:
            return False, "Not connected to database."
        try:
            result = self.collection.delete_many({"run_id": run_id})
            if result.deleted_count > 0:
                return True, f"Successfully deleted run {run_id} ({result.deleted_count} batches) from Cloud Atlas."
            else:
                return False, f"Run {run_id} not found."
        except Exception as e:
            return False, f"Delete failed: {str(e)}"

def get_cloud_results():
    """
    Convenience function to fetch all runs from Cloud Atlas.
    """
    importer = MongoResultsImporter()
    success, msg = importer.connect()
    if not success:
        return {"status": "error", "message": msg}

    data, err = importer.fetch_all_results()
    if err:
        return {"status": "error", "message": err}

    return {"status": "success", "data": data}

def download_cloud_run(run_id: str):
    """
    Downloads a cloud run and saves its JSON files to the local dashboard data directory.
    """
    importer = MongoResultsImporter()
    success, msg = importer.connect()
    if not success:
        return {"status": "error", "message": msg}

    doc, err = importer.fetch_single_result(run_id)
    if err:
        return {"status": "error", "message": err}
    if not doc:
        return {"status": "error", "message": f"Run {run_id} not found in Cloud Atlas."}

    workspace_root = Path(__file__).parent.parent.parent
    base_output_dir = workspace_root / "sys_output" / "dashboard_data"
    sys_config_dir = workspace_root / "input_data" / "sys_config"
    logs_dir = workspace_root / "sys_output" / "logs"

    for directory in [base_output_dir, sys_config_dir, logs_dir]:
        if directory.exists():
            for item in directory.iterdir():
                try:
                    if item.is_file(): item.unlink()
                    elif item.is_dir(): shutil.rmtree(item)
                except Exception as e:
                    print(f"Warning: Could not clean {item} in {directory}: {e}")
        else:
            directory.mkdir(parents=True, exist_ok=True)

    data_payload = doc.get("data", {})
    files_saved = []

    mapping = {
        "summary": "summary.json",
        "history": "history.json",
        "history_by_mode": "history_by_mode.json",
        "run_metadata": "latest.json",
        "network_config": "network_layout.json",
        "system_config": "system_param.json",
        "network_config_sys": "network_layout_config.json",
        "system_config_sys": "system_param_config.json",
        "optimization_config_sys": "optimization_config.json",
        "goals_comparison_results": "goals_comparison_results.json",
        "multi_goal_matrix_results": "multi_goal_matrix_results.json"
    }

    for key, filename in mapping.items():
        if key in data_payload:
            content = data_payload[key]
            if filename in ["network_layout_config.json", "system_param_config.json", "optimization_config.json"]:
                save_path = sys_config_dir / filename
            elif filename in ["goals_comparison_results.json", "multi_goal_matrix_results.json"]:
                save_path = base_output_dir / filename
            else:
                run_dir = base_output_dir / run_id
                run_dir.mkdir(parents=True, exist_ok=True)
                save_path = run_dir / filename
                
            with open(save_path, 'w') as f:
                json.dump(content, f, indent=4)
            files_saved.append(str(save_path.relative_to(workspace_root)))

    global_latest_path = base_output_dir / "latest.json"
    new_latest_info = data_payload.get("run_metadata", {})
    new_latest_info["latest_run_folder"] = run_id
    with open(global_latest_path, 'w') as f:
        json.dump(new_latest_info, f, indent=4)
    files_saved.append(str(global_latest_path.relative_to(workspace_root)))

    return {
        "status": "success",
        "message": f"Successfully downloaded {len(files_saved)} files and updated global latest.json.",
        "folder": run_id,
        "files": files_saved
    }

def delete_cloud_run(run_id: str):
    """
    Deletes a cloud run from Atlas.
    """
    importer = MongoResultsImporter()
    success, msg = importer.connect()
    if not success:
        return {"status": "error", "message": msg}

    ok, delete_msg = importer.delete_single_result(run_id)
    if not ok:
        return {"status": "error", "message": delete_msg}

    return {"status": "success", "message": delete_msg}

def fetch_traffic_window(start_dt: str, end_dt: str, output_filename: str = None):

    importer = MongoTrafficImporter()
    success, msg = importer.connect()
    if not success:
        return {"status": "error", "message": msg}

    data, err = importer.fetch_data(start_dt, end_dt)
    if err:
        return {"status": "error", "message": err}
    
    if not data:
        return {"status": "error", "message": "No data found for the specified temporal window."}

    if not output_filename:
        s = start_dt.replace(":", "").replace("-", "").replace("Z", "")
        e = end_dt.replace(":", "").replace("-", "").replace("Z", "")
        output_filename = f"db_fetch_{s}_to_{e}.json"

    workspace_root = Path(__file__).parent.parent.parent
    target_dir = workspace_root / "input_data" / "traffic_stream"
    
    if target_dir.exists():
        for existing_file in target_dir.glob("*.json"):
            try:
                existing_file.unlink()
            except Exception as e:
                print(f"Warning: Could not delete {existing_file}: {e}")

    save_path = target_dir / output_filename
    
    ok, save_msg = importer.save_to_json(data, str(save_path))
    if not ok:
        return {"status": "error", "message": save_msg}

    return {
        "status": "success", 
        "message": f"Successfully fetched {len(data)} records.",
        "filename": output_filename,
        "count": len(data)
    }
