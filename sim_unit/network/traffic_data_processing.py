import json
import logging
import csv
import sys
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict, deque
import xml.etree.ElementTree as ET
from xml.dom import minidom
import random
from sim_unit.utilities.path_utils import get_workspace_root

REPO_ROOT = Path(get_workspace_root(__file__))

class TrafficDataProcessing:
    def __init__(self, input_folder=None):
        self.input_folder = Path(input_folder) if input_folder else REPO_ROOT / "input_data" / "traffic_stream"
        self.raw_data = []
        self.processed_vehicles = defaultdict(list)
        self.processed_pedestrians = defaultdict(list)
        self.mapping_debug_rows = []
        self.wait_times = []
        self.edge_lengths = {}
        
        # --- STATE TRACKING ---
        self.active_sim_peds = defaultdict(list)
        self.PED_LIFETIME = 60 
        # Delta tracking
        self.prev_ped_counts = defaultdict(int) 
        
        # --- SLIDING MAX (Handles flickering) ---
        self.ped_history = defaultdict(lambda: deque(maxlen=30))
        self.veh_history = defaultdict(lambda: deque(maxlen=30))
        
        logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
        
        self.edge_mapping = {
            "EASTTOWEST": {"from_edge": "E2C", "to_edge": "C2W"},
            "WESTTOEAST": {"from_edge": "W2C", "to_edge": "C2E"},
            "SOUTHTONORTH": {"from_edge": "S2C", "to_edge": "C2N"},
            "NORTHTOSOUTH": {"from_edge": "N2C", "to_edge": "C2S"},
            "MAIN_CROSSING": {"from_edge": "E2C", "to_edge": "C2W"}
        }
        self.ped_edge_mapping = self.edge_mapping

    @staticmethod
    def _safe_int(value):
        try: return int(value)
        except (TypeError, ValueError): return 0

    def get_data_duration(self):
        if not self.raw_data: return None
        datetimes = [datetime.fromisoformat(e["datetime"].replace("Z", "+00:00")) for e in self.raw_data if e.get("datetime")]
        if not datetimes: return None
        duration = max(datetimes) - min(datetimes)
        return {
            "start_time": min(datetimes).isoformat(),
            "duration_seconds": duration.total_seconds()
        }

    def load_data(self):
        if not self.input_folder.exists():
            logging.error(f"Directory not found: {self.input_folder}")
            return
        json_files = list(self.input_folder.glob("*.json"))
        for file_path in json_files:
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    if isinstance(data, list): self.raw_data.extend(data)
                    else: self.raw_data.append(data)
            except Exception as e:
                logging.warning(f"Error loading {file_path.name}: {e}")
        
        self.raw_data.sort(key=lambda x: datetime.fromisoformat(x.get("datetime", "").replace("Z", "+00:00")))
        logging.info(f"Loaded {len(self.raw_data)} time steps.")

    def robust_entity_counter(self, signal, window=5):
        """
        Counts unique arrivals
        """
        if not signal: return 0, []
        
        # Median Filter (Denoising)
        smoothed = []
        for i in range(len(signal)):
            start = max(0, i - window // 2)
            end = min(len(signal), i + window // 2 + 1)
            chunk = sorted(signal[start:end])
            smoothed.append(chunk[len(chunk) // 2])
        
        # (Counting unique events and tracking indices)
        unique_count = 0
        prev_val = 0
        arrival_indices = []
        for idx, val in enumerate(smoothed):
            if val > prev_val:
                diff = val - prev_val
                unique_count += diff
                for _ in range(int(diff)):
                    arrival_indices.append(idx)
            prev_val = val
        return int(unique_count), arrival_indices

    def process_data(self, add_emergency=False, emergency_percentage=0.01):
        self.mapping_debug_rows = []
        self.wait_times = []
        self.processed_vehicles = defaultdict(list)
        self.processed_pedestrians = defaultdict(list)
        
        if not self.raw_data:
            logging.warning("No data to process.")
            return

        # Setup Simulation Time
        start_dt = datetime.fromisoformat(self.raw_data[0]['datetime'].replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(self.raw_data[-1]['datetime'].replace('Z', '+00:00'))
        self.sim_start_dt = start_dt
        self.sim_end_dt = end_dt
        total_mins = (end_dt - start_dt).total_seconds() / 60
        logging.info(f"Data Duration: {total_mins:.1f} minutes")

        # Filter Directions
        v_directions = ['SOUTHTONORTH', 'NORTHTOSOUTH']
        p_directions = ['EASTTOWEST', 'WESTTOEAST', 'MAIN_CROSSING']
        v_types = ['car', 'truck', 'motorcycle', 'bus', 'emergency']
        
        # Signals structure: {direction: {vtype: [values]}}
        v_signals = {d: {vt: [] for vt in v_types} for d in v_directions}
        p_signals = {d: [] for d in p_directions}
        
        # Mapping to JSON keys
        v_key_map = {
            'car': ('vehicles', 'cars_count', 'cars_passed'),
            'truck': ('vehicles', 'trucks_count', 'trucks_passed'),
            'motorcycle': ('vehicles', 'motorcycles_count', 'motorcycles_passed'),
            'bus': ('bus', 'bus_count', 'bus_passed'),
            'emergency': ('emergency_vehicles', 'emergency_vehicles_count', 'emergency_passed')
        }

        # Build Signals
        # Track how many lanes each direction has to map indices back to time.
        lane_counts = {d: 0 for d in v_directions}
        
        if self.raw_data:
            first_frame_lanes = self.raw_data[0].get('lanes', [])
            for d in v_directions:
                lane_counts[d] = sum(1 for l in first_frame_lanes if l['direction'] == d)
        
        for d in lane_counts:
            if lane_counts[d] == 0: lane_counts[d] = 1

        for frame in self.raw_data:
            dt_str = frame['datetime']
            for lane in frame.get('lanes', []):
                d = lane['direction']
                if d in v_directions:
                    for vt in v_types:
                        block_key, count_key, passed_key = v_key_map[vt]
                        block = lane.get(block_key, {})
                        val = self._safe_int(block.get(count_key, 0)) + self._safe_int(block.get(passed_key, 0))
                        v_signals[d][vt].append(val)
            
            frame_peds = {pd: 0 for pd in p_directions}
            for lane in frame.get('lanes', []):
                for ped in lane.get('pedestrians', []):
                    pd = ped['direction']
                    if pd in p_directions:
                        frame_peds[pd] += self._safe_int(ped.get('ped_count', 0)) + self._safe_int(ped.get('crossing_count', 0))
            for pd in p_directions:
                p_signals[pd].append(frame_peds[pd])

        # Count Unique Objects and Generate Arrivals
        grand_total_v = 0
        for d in v_directions:
            for vt in v_types:
                count, indices = self.robust_entity_counter(v_signals[d][vt], window=5)
                grand_total_v += count
                for idx in indices:
                    frame_idx = idx // lane_counts[d]
                    if frame_idx >= len(self.raw_data): frame_idx = len(self.raw_data) - 1
                    arrival_dt = self.raw_data[frame_idx]['datetime']
                    self.processed_vehicles[arrival_dt].append({"direction": d, "type": vt, "count": 1})

        # Add Emergency Vehicles
        num_emergency = 0
        if add_emergency:
            num_emergency = int(grand_total_v * emergency_percentage)
            for _ in range(num_emergency):
                rand_frame_idx = random.randint(0, len(self.raw_data) - 1)
                arrival_dt = self.raw_data[rand_frame_idx]['datetime']
                d = random.choice(v_directions)
                self.processed_vehicles[arrival_dt].append({"direction": d, "type": "emergency", "count": 1})
                logging.info(f"Added synthetic emergency vehicle in {d} at frame {rand_frame_idx}")

        # Process Pedestrians
        total_p = 0
        for pd in p_directions:
            count, indices = self.robust_entity_counter(p_signals[pd], window=5)
            total_p += count
            for idx in indices:
                arrival_dt = self.raw_data[idx]['datetime']
                self.processed_pedestrians[arrival_dt].append({"direction": pd, "count": 1})

        logging.info(f"Processing complete: {grand_total_v} total unique vehicles, {total_p} pedestrians.")
        if add_emergency:
            logging.info(f"Added {num_emergency} emergency vehicles ({emergency_percentage*100}%).")

    def export_sumo_routes(self, output_file="traffic_trips.rou.xml"):
        routes = ET.Element("routes")
        
        vtype_config = [
            {"id": "pedestrian", "vClass": "pedestrian", "maxSpeed": "1.4", "length": "0.5"},
            {"id": "car", "vClass": "passenger", "maxSpeed": "13.89", "length": "5.0"},
            {"id": "bus", "vClass": "bus", "maxSpeed": "13.89", "length": "12.0"},
            {"id": "emergency", "vClass": "emergency", "maxSpeed": "13.89", "length": "5.0", "guiShape": "emergency", "color": "1,0,0"},
            {"id": "truck", "vClass": "truck", "maxSpeed": "13.89", "length": "15.0"},
            {"id": "motorcycle", "vClass": "motorcycle", "maxSpeed": "18.0", "length": "2.0"}
        ]
        
        for specs in vtype_config:
            attribs = {k: v for k, v in specs.items() if k != "id"}
            ET.SubElement(routes, "vType", id=specs["id"], **attribs)

        all_dts = sorted(list(set(self.processed_vehicles.keys()) | set(self.processed_pedestrians.keys())))
        if not all_dts: return
        first_dt = self.sim_start_dt

        vid, pid = 0, 0
        for dt_str in all_dts:
            sim_sec = int((datetime.fromisoformat(dt_str.replace("Z", "+00:00")) - first_dt).total_seconds())
            
            for rec in self.processed_vehicles.get(dt_str, []):
                edge = self.edge_mapping.get(rec["direction"])
                if not edge: continue
                for _ in range(rec.get("count", 1)):
                    attribs = {
                        "id": f"v_{vid}",
                        "type": rec["type"],
                        "depart": str(sim_sec),
                        "from": edge["from_edge"],
                        "to": edge["to_edge"],
                        "departLane": "best",
                        "departSpeed": "max"
                    }
                    ET.SubElement(routes, "trip", **attribs)
                    vid += 1
            
            for rec in self.processed_pedestrians.get(dt_str, []):
                edge = self.ped_edge_mapping.get(rec["direction"])
                if not edge: continue
                for _ in range(rec.get("count", 1)):
                    pers = ET.SubElement(routes, "person", id=f"p_{pid}", depart=str(sim_sec))
                    ET.SubElement(pers, "walk", **{
                        "from": edge["from_edge"],
                        "to": edge["to_edge"],
                        "departPos": "-5.0",
                        "arrivalPos": "5.0"
                    })
                    pid += 1

        tree = ET.ElementTree(routes)
        tree.write(output_file, encoding="utf-8", xml_declaration=True)

    def export_traffic_lights(self, output_file="traffic_lights.add.xml", tl_id="center", num_links=20, ns_indices=None, ew_indices=None, ped_indices=None, net_file=None):
        """Generates a fixed-time traffic light program."""
        import xml.etree.ElementTree as ET
        from xml.dom import minidom
        
        if net_file and os.path.exists(net_file):
            try:
                tree = ET.parse(net_file)
                root = tree.getroot()
                
                ns_edges = {"N2C", "S2C"}
                ew_edges = {"E2C", "W2C"}
                
                ns_idx = []
                ew_idx = []
                ped_idx = []
                
                for conn in root.iter("connection"):
                    if conn.get("tl") == tl_id:
                        idx_str = conn.get("linkIndex")
                        if idx_str is not None:
                            idx = int(idx_str)
                            from_edge = conn.get("from")
                            if not from_edge:
                                continue
                            
                            if from_edge in ns_edges:
                                ns_idx.append(idx)
                            elif from_edge in ew_edges:
                                ew_idx.append(idx)
                            elif from_edge.startswith(":center_w") or from_edge.startswith(":center_c"):
                                ped_idx.append(idx)
                
                if ns_idx or ew_idx or ped_idx:
                    ns_indices = sorted(ns_idx)
                    ew_indices = sorted(ew_idx)
                    ped_indices = sorted(ped_idx)
                    num_links = max((ns_indices + ew_indices + ped_indices) + [-1]) + 1
            except Exception as e:
                logging.warning(f"Failed to parse net file for TLS indices: {e}")

        if ns_indices is None: ns_indices = [0, 1, 2, 3, 8, 9, 10, 11]
        if ew_indices is None: ew_indices = [4, 5, 6, 7, 12, 13, 14, 15]
        if ped_indices is None: ped_indices = [16, 17, 18, 19]

        additional = ET.Element("additional")
        tl_logic = ET.SubElement(additional, "tlLogic", id=tl_id, type="static", programID="fixed_time", offset="0")

        def build_state(green_indices, yellow_indices=None):
            state = ["r"] * num_links
            if green_indices:
                for i in green_indices:
                    if i < num_links: state[i] = "G"
            if yellow_indices:
                for i in yellow_indices:
                    if i < num_links: state[i] = "y"
            return "".join(state)

        p1_state = build_state(ns_indices)           # NS Green
        p2_state = build_state(None, ns_indices)     # NS Yellow
        p3_state = build_state(ew_indices)           # EW Green
        p4_state = build_state(None, ew_indices)     # EW Yellow
        p5_state = build_state(ped_indices)          # Ped Green (All Vehicles Red)
        p6_state = build_state(None)                 # All Red

        sys_config_path = REPO_ROOT / "input_data" / "sys_config" / "system_param_config.json"
        green_duration = 60
        yellow_duration = 5
        red_duration = 30
        all_red_clearance = 3
        
        if sys_config_path.exists():
            try:
                with open(sys_config_path, "r") as f:
                    sys_cfg = json.load(f)
                    init_tls = sys_cfg.get("initial_tls_program", {})
                    green_duration = init_tls.get("green_duration", green_duration)
                    yellow_duration = init_tls.get("yellow_duration", yellow_duration)
                    red_duration = init_tls.get("green_no_ped_duration", red_duration)
            except Exception as e:
                logging.warning(f"Failed to load system_param_config.json: {e}")

        ET.SubElement(tl_logic, "phase", duration=str(green_duration), state=p1_state)
        ET.SubElement(tl_logic, "phase", duration=str(yellow_duration), state=p2_state)
        ET.SubElement(tl_logic, "phase", duration=str(green_duration), state=p3_state)
        ET.SubElement(tl_logic, "phase", duration=str(yellow_duration), state=p4_state)
        ET.SubElement(tl_logic, "phase", duration=str(red_duration), state=p5_state)
        ET.SubElement(tl_logic, "phase", duration=str(all_red_clearance), state=p6_state)
        
        with open(output_file, "w") as f:
            xml_str = ET.tostring(additional, encoding='utf-8')
            f.write(minidom.parseString(xml_str).toprettyxml(indent="    "))

    def export_wait_times_csv(self, output_file="wait_times.csv"):
        if not self.wait_times: return
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        with open(output_file, "w", newline='') as f:
            writer = csv.DictWriter(f, fieldnames=["datetime", "type", "wait_time"])
            writer.writeheader()
            writer.writerows(self.wait_times)

    def export_mapping_debug_csv(self, output_file="mapping_debug.csv"):
        if not self.mapping_debug_rows: return
        with open(output_file, "w", newline='') as f:
            writer = csv.DictWriter(f, fieldnames=self.mapping_debug_rows[0].keys())
            writer.writeheader()
            writer.writerows(self.mapping_debug_rows)

    def export_mapping_debug_summary_csv(self, output_file="mapping_debug_summary.csv"):
        if not self.mapping_debug_rows: return
        summary = defaultdict(lambda: {"arrivals": 0, "waiting": 0})
        for row in self.mapping_debug_rows:
            key = (row["datetime"], row["direction"], row["actor_type"])
            summary[key]["arrivals"] += row["arrivals"]
            summary[key]["waiting"] = row["current_waiting"]
        with open(output_file, "w", newline='') as f:
            writer = csv.writer(f)
            writer.writerow(["datetime", "direction", "type", "arrivals", "waiting"])
            for (dt, dr, tp), vals in summary.items():
                writer.writerow([dt, dr, tp, vals["arrivals"], vals["waiting"]])

if __name__ == "__main__":
    # --- CONFIGURATION ---
    ENABLE_EMERGENCY_VEHICLES = True
    EMERGENCY_PERCENT = 0.005  # 0.5%
    
    processor = TrafficDataProcessing()
    processor.load_data()
    processor.process_data(add_emergency=ENABLE_EMERGENCY_VEHICLES, 
                          emergency_percentage=EMERGENCY_PERCENT)
    processor.export_sumo_routes()
    processor.export_traffic_lights()
    processor.export_wait_times_csv("output/wait_times.csv")
    processor.export_mapping_debug_csv()
    processor.export_mapping_debug_summary_csv()