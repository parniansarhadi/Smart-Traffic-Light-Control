import os
import subprocess
import time
import random
import shutil
import xml.etree.ElementTree as ET
import json
from sim_unit.utilities.path_utils import find_workspace_root, get_sumo_config_dir, get_sys_output_dir
from sim_unit.network.traffic_data_processing import TrafficDataProcessing


REPO_ROOT = find_workspace_root(__file__)


def _run_netconvert(nod_xml, edg_xml, net_xml):
    base_cmd = ["netconvert", "-n", nod_xml, "-e", edg_xml, "-o", net_xml]
    full_cmd = base_cmd + ["--crossings.guess", "true", "--walkingareas", "true"]

    try:
        subprocess.run(full_cmd, check=True)
    except subprocess.CalledProcessError as exc:
        print(
            "Warning: netconvert failed with pedestrian area flags "
            f"(returncode={exc.returncode}). Retrying with basic netconvert command."
        )
        try:
            subprocess.run(base_cmd, check=True)
        except subprocess.CalledProcessError as exc2:
            print(
                "Warning: basic netconvert command also failed "
                f"(returncode={exc2.returncode}). Trying bundled template net file fallback."
            )

            template_candidates = [
                os.path.join(get_sumo_config_dir(REPO_ROOT), "my.net.xml"),
            ]

            template_path = next((p for p in template_candidates if os.path.exists(p)), None)
            if not template_path:
                raise RuntimeError(
                    "netconvert failed and no fallback template net file was found. "
                    f"Checked: {template_candidates}"
                ) from exc2

            os.makedirs(os.path.dirname(net_xml), exist_ok=True)
            shutil.copyfile(template_path, net_xml)
            print(f"Using fallback network template: {template_path} -> {net_xml}")

def _allocate_weighted_counts(total, type_weights):
    if total <= 0:
        return {name: 0 for name, _ in type_weights}

    weighted = []
    floor_sum = 0
    for name, weight in type_weights:
        exact = float(total) * float(weight)
        base = int(exact)
        remainder = exact - base
        weighted.append((name, base, remainder))
        floor_sum += base

    remaining = total - floor_sum
    weighted.sort(key=lambda item: item[2], reverse=True)
    counts = {name: base for name, base, _ in weighted}

    for i in range(remaining):
        counts[weighted[i % len(weighted)][0]] += 1

    return counts

class NetworkManager:
    def __init__(self, config_dir=None):
        config_dir = config_dir or get_sumo_config_dir(REPO_ROOT)
        self.config_dir = config_dir if os.path.isabs(config_dir) else os.path.join(REPO_ROOT, config_dir)
        if not os.path.exists(self.config_dir):
            os.makedirs(self.config_dir)
        
        # Paths for SUMO files
        self.net_file = os.path.join(self.config_dir, "my.net.xml")
        self.rou_file = os.path.join(self.config_dir, "routes.rou.xml")
        self.flow_rou_file = os.path.join(self.config_dir, "flows.rou.xml")
        self.ped_rou_file = os.path.join(self.config_dir, "p_routes.rou.xml")
        self.add_file = os.path.join(self.config_dir, "vtypes.add.xml")
        self.cfg_file = os.path.join(self.config_dir, "my.sumocfg")
        self.last_type_weights = []

    def _load_available_edges(self):
        try:
            net_tree = ET.parse(self.net_file)
            return {
                e.get("id")
                for e in net_tree.getroot().iter("edge")
                if e.get("id") and e.get("function") != "internal"
            }
        except Exception:
            return set()

    @staticmethod
    def write_flow_guarded(file_obj, available_edges, flow_id, vtype, begin, end, probability, route_edges):
        """Write a flow only when all route edges exist in the generated net."""
        edge_list = route_edges.split()
        if not all(edge in available_edges for edge in edge_list):
            print(f"Skipping flow '{flow_id}' due to missing edges: {route_edges}")
            return False

        file_obj.write(
            f'    <flow id="{flow_id}" type="{vtype}" begin="{begin}" end="{end}" '
            f'probability="{probability}" departLane="best">\n'
        )
        file_obj.write(f'        <route edges="{route_edges}"/>\n')
        file_obj.write('    </flow>\n')
        return True

    @staticmethod
    def write_periodic_flow_guarded(file_obj, available_edges, flow_id, vtype, begin, end, period, route_edges):
        """Write a periodic flow with exact spacing to test traffic control phases."""
        edge_list = route_edges.split()
        if not all(edge in available_edges for edge in edge_list):
            print(f"Skipping periodic flow '{flow_id}' due to missing edges: {route_edges}")
            return False

        file_obj.write(
            f'    <flow id="{flow_id}" type="{vtype}" begin="{begin}" end="{end}" '
            f'period="{period}" departLane="best">\n'
        )
        file_obj.write(f'        <route edges="{route_edges}"/>\n')
        file_obj.write('    </flow>\n')
        return True

    def build_network(self):
        nod_xml = os.path.join(self.config_dir, "my.nod.xml")
        edg_xml = os.path.join(self.config_dir, "my.edg.xml")

        # Create nodes and edges
        with open(nod_xml, "w") as f:
            f.write('<nodes>\n<node id="center" x="0" y="0" type="traffic_light"/>\n'
                    '<node id="n" x="0" y="100"/> <node id="s" x="0" y="-100"/>\n'
                    '<node id="e" x="100" y="0"/> <node id="w" x="-100" y="0"/>\n</nodes>')
        
        with open(edg_xml, "w") as f:
            f.write('<edges>\n'
                    '<edge id="N2C" from="n" to="center" numLanes="3" sidewalkWidth="3"/>\n'
                    '<edge id="C2S" from="center" to="s" numLanes="3" sidewalkWidth="3"/>\n'
                    '<edge id="S2C" from="s" to="center" numLanes="3" sidewalkWidth="3"/>\n'
                    '<edge id="C2N" from="center" to="n" numLanes="3" sidewalkWidth="3"/>\n'
                    '<edge id="W2C" from="w" to="center" numLanes="3" sidewalkWidth="3"/>\n'
                    '<edge id="C2E" from="center" to="e" numLanes="3" sidewalkWidth="3"/>\n'
                    '<edge id="E2C" from="e" to="center" numLanes="3" sidewalkWidth="3"/>\n'
                    '<edge id="C2W" from="center" to="w" numLanes="3" sidewalkWidth="3"/>\n'
                    '</edges>')

        _run_netconvert(nod_xml, edg_xml, self.net_file)

    def generate_traffic(self, total_time, manual_bus=None, manual_emergency=None, add_emergency=False, emergency_percentage=0.01):
        current_seed = int(time.time())
        tools = os.path.join(os.environ['SUMO_HOME'], 'tools')
        random_trips = os.path.join(tools, "randomTrips.py")

        def _env_float(name, default_value):
            raw = os.environ.get(name)
            if raw is None:
                return float(default_value)
            try:
                value = float(raw)
                return value if value > 0 else float(default_value)
            except (TypeError, ValueError):
                return float(default_value)

        vehicle_period = _env_float("SUMO_VEHICLE_PERIOD", 2.5)
        pedestrian_period = _env_float("SUMO_PEDESTRIAN_PERIOD", 3.0)
        flow_scale = _env_float("SUMO_FLOW_SCALE", 1.0)

        def _env_int(name, default_value):
            raw = os.environ.get(name)
            if raw is None:
                return int(default_value)
            try:
                return max(0, int(float(raw)))
            except (TypeError, ValueError):
                return int(default_value)

        if manual_bus is None:
            env_bus = os.environ.get("SUMO_MANUAL_BUS_COUNT")
            if env_bus is not None:
                manual_bus = _env_int("SUMO_MANUAL_BUS_COUNT", 0)
        if manual_emergency is None:
            env_emergency = os.environ.get("SUMO_MANUAL_EMERGENCY_COUNT")
            if env_emergency is not None:
                manual_emergency = _env_int("SUMO_MANUAL_EMERGENCY_COUNT", 0)

        with open(self.add_file, "w") as f:
            f.write('<additional>\n'
                    '    <vType id="car" vClass="passenger" guiShape="passenger" color="orange"/>\n'
                    '    <vType id="truck" vClass="truck" guiShape="truck" color="green"/>\n'
                    '    <vType id="motorcycle" vClass="motorcycle" guiShape="motorcycle" color="red"/>\n'
                    '    <vType id="bus" vClass="bus" guiShape="bus" color="yellow"/>\n'
                    '    <vType id="emergency" vClass="emergency" guiShape="emergency" color="white"/>\n'
                    '</additional>\n')

        temp_rou = os.path.join(self.config_dir, "temp.rou.xml")
        subprocess.run(["python3", random_trips, "-n", self.net_file, "-e", str(total_time), 
                "--period", str(vehicle_period), "--poisson", "--seed", str(current_seed), 
                        "--fringe-factor", "10", "--lanes", "-o", os.path.join(self.config_dir, "trips.xml"), 
                        "--route-file", temp_rou], check=True)

        # Distribute vehicle types
        tree = ET.parse(temp_rou)
        vehicles = tree.getroot().findall('vehicle') + tree.getroot().findall('trip')
        
        if manual_bus is not None or manual_emergency is not None or add_emergency:
            num_bus = manual_bus if manual_bus is not None else int(len(vehicles) * 0.08)
            
            if manual_emergency is not None:
                num_emergency = manual_emergency
            else:
                num_emergency = 0
            
            # Ensure we don't exceed total generated trips
            if num_bus + num_emergency > len(vehicles):
                print("Warning: Requested more special vehicles than total trips. Scaling down.")
                total_special = num_bus + num_emergency
                num_bus = int(len(vehicles) * (num_bus / total_special))
                num_emergency = int(len(vehicles) * (num_emergency / total_special))
                
            indices = list(range(len(vehicles)))
            random.shuffle(indices)
            
            bus_indices = set(indices[:num_bus])
            emergency_indices = set(indices[num_bus:num_bus+num_emergency])
            
            # Re-balance the weights for the remaining vehicle types (excluding bus and emergency)
            type_weights = [("car", 0.78), ("truck", 0.11), ("motorcycle", 0.11)]
            self.last_type_weights = [
                ("car", 0.78),
                ("truck", 0.11),
                ("motorcycle", 0.11),
                ("bus", num_bus / len(vehicles) if vehicles else 0.0),
                ("emergency", num_emergency / len(vehicles) if vehicles else 0.0),
            ]

            remaining_count = max(0, len(vehicles) - num_bus - num_emergency)
            remaining_counts = _allocate_weighted_counts(remaining_count, type_weights)
            remaining_types = []
            for vtype, _ in type_weights:
                remaining_types.extend([vtype] * remaining_counts[vtype])
            random.shuffle(remaining_types)
            remaining_idx = 0
            
            for i, vehicle in enumerate(vehicles):
                if i in bus_indices:
                    vehicle.set('type', 'bus')
                elif i in emergency_indices:
                    vehicle.set('type', 'emergency')
                else:
                    vehicle.set('type', remaining_types[remaining_idx])
                    remaining_idx += 1
        else:
            eff_emergency_percent = emergency_percentage if add_emergency else 0.02
            type_weights = [("car", 0.70), ("truck", 0.10), ("motorcycle", 0.10), ("bus", 0.08), ("emergency", eff_emergency_percent)]
            self.last_type_weights = type_weights
            counts = _allocate_weighted_counts(len(vehicles), type_weights)
            assigned_types = []
            for vtype, _ in type_weights:
                assigned_types.extend([vtype] * counts[vtype])
            random.shuffle(assigned_types)
            for vehicle, vtype in zip(vehicles, assigned_types):
                vehicle.set('type', vtype)
                
        tree.write(self.rou_file)
        os.remove(temp_rou)

        available_edges = self._load_available_edges()

        # --- RUSH HOUR INJECTION ---
        # Add heavily imbalanced directional flows on top of the base random traffic
        with open(self.flow_rou_file, "w") as f:
            f.write('<routes>\n')

            # Morning Rush: Heavy North-South
            scaled_main_prob = min(1.0, 0.3 * flow_scale)
            scaled_ev_prob = min(1.0, 0.02 * flow_scale)

            self.write_flow_guarded(f, available_edges, "morning_N2S", "car", 0, 1200, scaled_main_prob, "N2C C2S")
            self.write_flow_guarded(f, available_edges, "morning_S2N", "car", 0, 1200, scaled_main_prob, "S2C C2N")
            
            if manual_emergency is None:
                self.write_periodic_flow_guarded(f, available_edges, "morning_ev_N2S", "emergency", 68, 1200, 200, "N2C C2S")
                self.write_periodic_flow_guarded(f, available_edges, "morning_ev_S2N", "emergency", 68, 1200, 200, "S2C C2N")
            
            # Evening Rush: Heavy East-West
            self.write_flow_guarded(f, available_edges, "evening_E2W", "car", 2400, 3600, scaled_main_prob, "E2C C2W")
            self.write_flow_guarded(f, available_edges, "evening_W2E", "car", 2400, 3600, scaled_main_prob, "W2C C2E")
            
            if manual_emergency is None:
                self.write_periodic_flow_guarded(f, available_edges, "evening_ev_E2W", "emergency", 2418, 3600, 200, "E2C C2W")
                self.write_periodic_flow_guarded(f, available_edges, "evening_ev_W2E", "emergency", 2418, 3600, 200, "W2C C2E")
            f.write('</routes>')

        # Pedestrian generation
        subprocess.run(["python3", random_trips, "-n", self.net_file, "-e", str(total_time), 
                        "--period", str(pedestrian_period), "--poisson", "--seed", str(current_seed), 
                        "-o", os.path.join(self.config_dir, "p_trips.xml"), 
                        "--route-file", self.ped_rou_file, "--pedestrians"], check=True)

    def create_sumo_config(self, total_time):
        """Generates the main .sumocfg file."""
        with open(self.cfg_file, "w") as f:
            f.write(f'''<configuration>
    <input>
        <net-file value="my.net.xml"/>
        <route-files value="routes.rou.xml,flows.rou.xml,p_routes.rou.xml"/>
        <additional-files value="vtypes.add.xml"/>
    </input>
    <time><begin value="0"/><end value="{total_time}"/></time>
</configuration>''')
 
    def check_vehicle_distribution(self):
        """Check the distribution of vehicle types in the generated route file."""
        try:
            tree = ET.parse(self.rou_file)
            root = tree.getroot()
            types = {}
            total = 0
            
            for vehicle in root.findall('vehicle'):
                vtype = vehicle.get('type')
                types[vtype] = types.get(vtype, 0) + 1
                total += 1
            
            print("\nVehicle type distribution:")
            print("-" * 40)
            for vtype, count in sorted(types.items()):
                percentage = (count / total) * 100
                print(f"{vtype:12s}: {count:3d} vehicles ({percentage:.1f}%)")
            print("-" * 40)
            print(f"Total: {total} vehicles")
            
        except FileNotFoundError:
            print("Route file not found yet.")
        except Exception as e:
            print(f"Error checking distribution: {e}")
            
class NetworkConstructor:
    """
    Reads the intersection layout configuration and builds a SUMO network and configuration file dynamically.
    """
    def __init__(self, config_file=None, output_dir=None):
        self.config_file = config_file or os.path.join(REPO_ROOT, "input_data", "sys_config", "network_layout_config.json")
        output_dir = output_dir or get_sumo_config_dir(REPO_ROOT)
        self.output_dir = output_dir if os.path.isabs(output_dir) else os.path.join(REPO_ROOT, output_dir)
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)
            
        self.net_file = os.path.join(self.output_dir, "my.net.xml")
        self.cfg_file = os.path.join(self.output_dir, "my.sumocfg")
        self.rou_file = os.path.join(self.output_dir, "routes.rou.xml")
        self.flow_rou_file = os.path.join(self.output_dir, "flows.rou.xml")
        self.ped_rou_file = os.path.join(self.output_dir, "p_routes.rou.xml")
        self.stream_json_frames = []
        self.stream_start_datetime = None
        
    def build_network_layout(self):
        with open(self.config_file, "r") as f:
            config_data = json.load(f)
            
        struct = config_data.get("structure_data", {})
        lanes = {l["direction_id"]: l for l in struct.get("lanes", [])}
        peds = {p["crosswalk_placement"]: p for p in struct.get("pedestrians", [])}
        lights = {l["direction_id"]: l for l in struct.get("traffic_lights", [])}
        
        nod_xml = os.path.join(self.output_dir, "my.nod.xml")
        edg_xml = os.path.join(self.output_dir, "my.edg.xml")
        
        # Determine node distances (default 100 if missing or 0)
        def get_len(dir_id):
            l = lanes.get(dir_id, {}).get("observable_length")
            return l if l else 100
            
        ns_len = get_len("NORTH_SOUTH")
        sn_len = get_len("SOUTH_NORTH")
        ew_len = get_len("East_West")
        we_len = get_len("West_East")
        
        has_tl = any(l.get("stoplight_count", 0) > 0 for l in lights.values())
        center_type = ' type="traffic_light"' if has_tl else ''
        
        # Create Nodes
        with open(nod_xml, "w") as f:
            f.write('<nodes>\n')
            f.write(f'  <node id="center" x="0" y="0"{center_type}/>\n')
            f.write(f'  <node id="n" x="0" y="{ns_len}"/>\n')
            f.write(f'  <node id="s" x="0" y="-{sn_len}"/>\n')
            f.write(f'  <node id="e" x="{ew_len}" y="0"/>\n')
            f.write(f'  <node id="w" x="-{we_len}" y="0"/>\n')
            f.write('</nodes>\n')
            
        # Create Edges mapped to TrafficDataProcessing edge names
        with open(edg_xml, "w") as f:
            f.write('<edges>\n')
            def add_edge(dir_id, edge_in, from_in, to_in, edge_out, from_out, to_out):
                l_count = lanes.get(dir_id, {}).get("lanes_count", 0)
                sw = peds.get(dir_id, {}).get("sidewalkWidth", 0)
                if l_count > 0:
                    sw_str = f' sidewalkWidth="{sw}"' if sw > 0 else ''
                    f.write(f'  <edge id="{edge_in}" from="{from_in}" to="{to_in}" numLanes="{l_count}"{sw_str}/>\n')
                    f.write(f'  <edge id="{edge_out}" from="{from_out}" to="{to_out}" numLanes="{l_count}"{sw_str}/>\n')
                elif sw > 0:
                    f.write(f'  <edge id="{edge_in}" from="{from_in}" to="{to_in}" numLanes="1" allow="pedestrian" width="{sw}"/>\n')
                    f.write(f'  <edge id="{edge_out}" from="{from_out}" to="{to_out}" numLanes="1" allow="pedestrian" width="{sw}"/>\n')
            
            add_edge("NORTH_SOUTH", "N2C", "n", "center", "C2S", "center", "s")
            add_edge("SOUTH_NORTH", "S2C", "s", "center", "C2N", "center", "n")
            add_edge("East_West", "E2C", "e", "center", "C2W", "center", "w")
            add_edge("West_East", "W2C", "w", "center", "C2E", "center", "e")
            f.write('</edges>\n')
            
        _run_netconvert(nod_xml, edg_xml, self.net_file)

    # Backward-compatible wrapper for existing callers.
    def build_network(self):
        self.build_network_layout()

    def traffic_generator(self, total_time, mode="synthetic", manual_bus=None, manual_emergency=None, add_emergency=False, emergency_percentage=0.01):
        if mode == "synthetic":
            nm = NetworkManager(config_dir=self.output_dir)
            nm.generate_traffic(total_time, manual_bus=manual_bus, manual_emergency=manual_emergency)
            return

        if mode == "stream":
            return self._generate_stream_traffic(total_time, add_emergency=add_emergency, emergency_percentage=emergency_percentage)

        raise ValueError(f"Unsupported traffic generation mode: {mode}. Expected 'synthetic' or 'stream'.")
    def _generate_stream_traffic(self, total_time, add_emergency=False, emergency_percentage=0.01):
        stream_dir = os.path.join(REPO_ROOT, "input_data", "traffic_stream")
        if not os.path.isdir(stream_dir):
            raise FileNotFoundError(f"Stream traffic folder not found: {stream_dir}")

        processor = TrafficDataProcessing(input_folder=stream_dir)
        processor.load_data()
        if not processor.raw_data:
            raise RuntimeError(f"No stream traffic snapshots were loaded from {stream_dir}")

        self.stream_json_frames = list(processor.raw_data)
        self.stream_start_datetime = self.stream_json_frames[0].get("datetime") if self.stream_json_frames else None

        duration_stats = processor.get_data_duration() or {}
        derived_total_time = int(duration_stats.get("duration_seconds", 0)) + 1
        
        processor.process_data(add_emergency=add_emergency, emergency_percentage=emergency_percentage)
        
        # Determine how many links the 'center' TLS has in the CURRENT network
        tl_links = self._count_tl_links("center")
        
        processor.export_traffic_lights(
            output_file=os.path.join(self.output_dir, "intersection_lights.add.xml"), 
            tl_id="center",
            net_file=self.net_file
        )
        processor.edge_mapping = {
            "SOUTHTONORTH": {"from_edge": "S2C", "to_edge": "C2N"},
            "NORTHTOSOUTH": {"from_edge": "N2C", "to_edge": "C2S"},
        }
        processor.ped_edge_mapping = {
            "EASTTOWEST": {"from_edge": "E2C", "to_edge": "C2W"},
            "WESTTOEAST": {"from_edge": "W2C", "to_edge": "C2E"},
            "SOUTHTONORTH": {"from_edge": "S2C", "to_edge": "C2N"},
            "NORTHTOSOUTH": {"from_edge": "N2C", "to_edge": "C2S"},
        }

        # Remove mappings whose edges are not available in the generated network.
        available_edges = NetworkManager(config_dir=self.output_dir)._load_available_edges()
        if not available_edges:
            available_edges = {"N2C", "C2S", "S2C", "C2N", "E2C", "C2W", "W2C", "C2E"}
            
        fallback_peds = {
            "EASTTOWEST": {"from_edge": "E2C" if "E2C" in available_edges else "N2C", "to_edge": "C2W" if "C2W" in available_edges else "C2S"},
            "WESTTOEAST": {"from_edge": "W2C" if "W2C" in available_edges else "S2C", "to_edge": "C2E" if "C2E" in available_edges else "C2N"},
            "SOUTHTONORTH": {"from_edge": "S2C", "to_edge": "C2N"},
            "NORTHTOSOUTH": {"from_edge": "N2C", "to_edge": "C2S"},
        }
        processor.ped_edge_mapping = {
            direction: mapping
            for direction, mapping in fallback_peds.items()
            if mapping["from_edge"] in available_edges and mapping["to_edge"] in available_edges
        }

        with open(self.config_file, "r") as f:
            config_data = json.load(f)
        structure_data = config_data.get("structure_data", {})
        lanes = {lane.get("direction_id"): lane for lane in structure_data.get("lanes", [])}

        def lane_length(direction_id, default=100.0):
            lane = lanes.get(direction_id, {})
            value = lane.get("observable_length")
            return float(value if value else default)

        processor.edge_lengths = {
            "S2C": lane_length("SOUTH_NORTH"),
            "C2N": lane_length("SOUTH_NORTH"),
            "N2C": lane_length("NORTH_SOUTH"),
            "C2S": lane_length("NORTH_SOUTH"),
            "E2C": lane_length("East_West"),
            "C2E": lane_length("East_West"),
            "W2C": lane_length("West_East"),
            "C2W": lane_length("West_East"),
        }


        processor.export_wait_times_csv(output_file=os.path.join(self.output_dir, "wait_times.csv"))
        sys_output_dir = get_sys_output_dir(REPO_ROOT)
        os.makedirs(sys_output_dir, exist_ok=True)
        processor.export_mapping_debug_csv(
            output_file=os.path.join(sys_output_dir, "mapping_debug.csv")
        )
        processor.export_mapping_debug_summary_csv(
            output_file=os.path.join(sys_output_dir, "mapping_debug_summary.csv")
        )
        
        processor.export_sumo_routes(output_file=self.rou_file)
            
        self._write_stream_placeholders()
        return derived_total_time

    def _write_stream_placeholders(self):
        for placeholder in (self.flow_rou_file, self.ped_rou_file):
            with open(placeholder, "w") as f:
                f.write('<routes>\n</routes>\n')
                        
    def create_sumo_config(
        self,
        route_files="routes.rou.xml",
        additional_files="intersection_lights.add.xml",
        total_time=360,
    ):
        """Generates the main .sumocfg file."""
        with open(self.cfg_file, "w") as f:
            f.write('<configuration>\n')
            f.write('    <input>\n')
            f.write('        <net-file value="my.net.xml"/>\n')
            f.write(f'        <route-files value="{route_files}"/>\n')
            f.write(f'        <additional-files value="{additional_files}"/>\n')
            f.write('    </input>\n')
            f.write('    <time>\n')
            f.write('        <begin value="0"/>\n')
            f.write(f'        <end value="{int(total_time)}"/>\n')
            f.write('    </time>\n')
            f.write('</configuration>\n')

    def check_vehicle_distribution(self):
        """Check the distribution of vehicle types in the generated route file."""
        try:
            tree = ET.parse(self.rou_file)
            root = tree.getroot()
            types = {}
            total = 0
            
            for vehicle in root.findall('vehicle'):
                vtype = vehicle.get('type')
                types[vtype] = types.get(vtype, 0) + 1
                total += 1
            
            print("\nVehicle type distribution:")
            print("-" * 40)
            for vtype, count in sorted(types.items()):
                percentage = (count / total) * 100
                print(f"{vtype:12s}: {count:3d} vehicles ({percentage:.1f}%)")
            print("-" * 40)
            print(f"Total: {total} vehicles")
            
        except FileNotFoundError:
            print("Route file not found yet.")
        except Exception as e:
            print(f"Error checking distribution: {e}")

    def _count_tl_links(self, tl_id):
        if not os.path.exists(self.net_file):
            print(f"DEBUG: {self.net_file} not found. Using fallback link count 20.")
            return 20 
        
        try:
            import xml.etree.ElementTree as ET
            tree = ET.parse(self.net_file)
            root = tree.getroot()
            links = 0

            for conn in root.iter("connection"):
                if conn.get("tl") == tl_id:
                    idx = conn.get("linkIndex")
                    if idx is not None:
                        links = max(links, int(idx) + 1)
            
            final_links = links if links > 0 else 20
            print(f"DEBUG: Detected {final_links} signal links for TLS '{tl_id}'.")
            return final_links
        except Exception as e:
            print(f"DEBUG: Error counting TL links: {e}. Using fallback 20.")
            return 20
    