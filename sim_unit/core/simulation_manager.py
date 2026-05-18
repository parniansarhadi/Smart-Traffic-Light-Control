import traci
from traci import constants as tc
import os
import sys
import time
from datetime import datetime, timedelta
from collections import deque, defaultdict
from sim_unit.metrics.data_collector import DataCollector, QueueCalculator
from sim_unit.traffic_control.traffic_light_controller import FixedTimeController, AdaptiveController
from sim_unit.traffic_control.traffic_light_setup import TrafficLightSetup
from sim_unit.traffic_control.phase_tracker import PhaseTracker
from sim_unit.traffic_control.starvation_monitor import StarvationMonitor
from sim_unit.metrics.duration_tracker import DurationTracker
from sim_unit.app_logging.simulation_logger import SimulationLogger
from sim_unit.traffic_control.adaptive_integrator import AdaptiveIntegrator
from sim_unit.metrics.qdr_tracker import QDRTracker
from sim_unit.utilities.path_utils import get_sys_output_dir

class EmissionTracker:
    def __init__(self, log_path):
        self.log_path = log_path
        self.veh_static_cache = {} 
        self.passed_vehicles = set()
        self.totals = {
            "all": {"co2_mg": 0.0, "fuel_mg": 0.0, "count": 0},
            "regular": {"co2_mg": 0.0, "fuel_mg": 0.0, "count": 0},
            "bus": {"co2_mg": 0.0, "fuel_mg": 0.0, "count": 0},
            "emergency": {"co2_mg": 0.0, "fuel_mg": 0.0, "count": 0}
        }
        self.current_step_co2 = 0.0
        self.current_step_fuel = 0.0
        self.total_co2_mg = 0.0
        self.total_fuel_mg = 0.0

    def update(self, vehicle_data):
        """
        Update emissions using pre-collected vehicle data to avoid redundant TraCI calls.
        """
        self.current_step_co2 = 0.0
        self.current_step_fuel = 0.0
        
        for v, data in vehicle_data.items():
            co2 = max(0, data.get(tc.VAR_CO2EMISSION, 0))
            fuel = max(0, data.get(tc.VAR_FUELCONSUMPTION, 0))
            
            self.current_step_co2 += co2
            self.current_step_fuel += fuel
            self.total_co2_mg += co2
            self.total_fuel_mg += fuel

            if v not in self.passed_vehicles:
                if v not in self.veh_static_cache:
                    try:
                        vtype = traci.vehicle.getTypeID(v)
                        vtype_lower = vtype.lower()
                        cat = "bus" if ("bus" in vtype_lower or "pt" in vtype_lower) else ("emergency" if "emergency" in vtype_lower else "regular")
                        self.veh_static_cache[v] = cat
                    except:
                        continue
                
                cat = self.veh_static_cache[v]
                
                if not hasattr(self, 'veh_cumulative'): self.veh_cumulative = defaultdict(lambda: {"co2": 0.0, "fuel": 0.0})
                
                self.veh_cumulative[v]["co2"] += co2
                self.veh_cumulative[v]["fuel"] += fuel
                
                # Check if vehicle has safely left the intersection
                edge = data.get(tc.VAR_ROAD_ID, "")
                if edge in ["C2N", "C2S", "C2E", "C2W"]:
                    self.passed_vehicles.add(v)
                    
                    for key in ["all", cat]:
                        self.totals[key]["co2_mg"] += self.veh_cumulative[v]["co2"]
                        self.totals[key]["fuel_mg"] += self.veh_cumulative[v]["fuel"]
                        self.totals[key]["count"] += 1

                    if v in self.veh_cumulative: del self.veh_cumulative[v]

    def save_results(self, run_name):
        with open(self.log_path, "a") as f:
            f.write(f"[{run_name.upper()}] EMISSIONS & FUEL (Origin to Intersection)\n")
            f.write("-" * 85 + "\n")
            f.write(f"{'Category':<15} | {'Count':<10} | {'Avg CO2 (grams)':<22} | {'Avg Fuel (grams)':<22}\n")
            f.write("-" * 85 + "\n")
            for cat, data in self.totals.items():
                c = data["count"]
                avg_co2 = (data["co2_mg"] / c / 1000.0) if c > 0 else 0.0
                avg_fuel = (data["fuel_mg"] / c / 1000.0) if c > 0 else 0.0
                f.write(f"{cat.capitalize():<15} | {c:<10} | {avg_co2:<22.2f} | {avg_fuel:<22.2f}\n")
            f.write("\n")


import sys
class DualLogger:
    def __init__(self, filepath):
        self.terminal = sys.stdout
        self.log = open(filepath, "a")
        self.last_flush = time.time()

    def write(self, message):
        self.terminal.write(message)
        self.log.write(message)
        if time.time() - self.last_flush > 10:
            self.flush()

    def flush(self):
        self.terminal.flush()
        self.log.flush()
        self.last_flush = time.time()


class SimulationManager:
    def __init__(self, sumocfg, log_dir=None, network_config=None):
        log_dir = log_dir or get_sys_output_dir()
        self.sumocfg = sumocfg
        self.network_config = network_config or {}
        os.makedirs(os.path.join(log_dir, "logs"), exist_ok=True)
        self.log_path = os.path.join(log_dir, "logs", "preemption_events.txt")
        self.object_pools = {
            "car": deque(), "truck": deque(), "motorcycle": deque(),
            "bus": deque(), "emergency": deque(), "pedestrian": deque()
        }
        
        console_log_path = os.path.join(log_dir, "logs", "console_output.txt")
        if not isinstance(sys.stdout, DualLogger):
            sys.stdout = DualLogger(console_log_path)
            
        self.logger = SimulationLogger(self.log_path, "init", False)
        self.lane_timings = {"N2C_1": {"green": 50, "yellow": 4}, "W2C_1": {"green": 30, "yellow": 5}}
        
        # Stability Guardrails
        self.strict_min_green = False
        self.min_green_time_preempt = 20

    def _get_dynamic_red_config(self):
        return self.network_config.get("adaptive_control", {}).get("dynamic_max_red", {})

    def _get_adaptive_config(self):
        """Returns the full adaptive control configuration block."""
        return self.network_config.get("adaptive_control", {})

    def rotate_gui_view_clockwise(self, degrees, view_id="View #0"):
        """Rotate SUMO GUI view clockwise by the specified degrees.
        """
        if not degrees:
            return
        try:
            current_angle = traci.gui.getAngle(view_id)
            new_angle = (current_angle + float(degrees)) % 360.0
            traci.gui.setAngle(view_id, new_angle)
            self.logger.log_event(
                0,
                self.logger.mode,
                self.logger.ev_preemption,
                "GUI_ROTATE",
                "SYSTEM",
                f"Rotated GUI view by {degrees} deg clockwise (angle={new_angle:.1f})",
            )
        except Exception as exc:
            print(f"Warning: could not rotate GUI view by {degrees} deg: {exc}")

    def _close_sumo_connection(self):
        try:
            if traci.isLoaded(): traci.close()
        except: pass


    @staticmethod
    def _count_active_vehicles_by_type(vehicle_data):
        """Count active vehicles by type using pre-collected vehicle data."""
        counts = {
            "car": 0,
            "truck": 0,
            "motorcycle": 0,
            "bus": 0,
            "emergency": 0,
            "other": 0,
        }
        for veh_id, data in vehicle_data.items():
            veh_type = data.get(tc.VAR_TYPE, "other")
            if veh_type in counts:
                counts[veh_type] += 1
            else:
                counts["other"] += 1
        return counts

    @staticmethod
    def _bucket_vehicle_type(vehicle_type):
        if vehicle_type in {"car", "truck", "motorcycle", "bus", "emergency"}:
            return vehicle_type
        return "other"

    @staticmethod
    def _calculate_lane_utilization(lanes, lane_data):
        utilizations = []
        for lane in lanes:
            data = lane_data.get(lane, {})
            occ = data.get(tc.LAST_STEP_OCCUPANCY, 0.0)
            utilizations.append(occ)
        return sum(utilizations) / len(utilizations) if utilizations else 0.0

    @staticmethod
    def _count_live_pedestrian_states(person_data, waiting_edges=None, crossing_edges=None):

        waiting_edges_set = set(waiting_edges or [])
        crossing_edges_set = set(crossing_edges or [])
        waiting = 0
        crossing = 0
        other = 0

        for ped_id, data in person_data.items():
            ped_edge = data.get(tc.VAR_ROAD_ID, "")

            if ped_edge in crossing_edges_set or (ped_edge.startswith(":") and "_c" in ped_edge):
                crossing += 1
            elif ped_edge in waiting_edges_set or (ped_edge.startswith(":") and "_w" in ped_edge):
                waiting += 1
            else:
                other += 1

        return waiting, crossing, other

    @staticmethod
    def _safe_int(value):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _extract_json_frame_counts(frame):
        """Extract vehicle and pedestrian counts from JSON frame at stoplight.
        """
        if not frame:
            return {
                "car": 0, "truck": 0, "motorcycle": 0, "bus": 0, "emergency": 0, "pedestrians": 0,
                "car_crossing": 0, "truck_crossing": 0, "motorcycle_crossing": 0, "bus_crossing": 0, "emergency_crossing": 0, "ped_crossing": 0
            }
        
        counts = {
            "car": 0, "truck": 0, "motorcycle": 0, "bus": 0, "emergency": 0, "pedestrians": 0,
            "car_crossing": 0, "truck_crossing": 0, "motorcycle_crossing": 0, "bus_crossing": 0, "emergency_crossing": 0, "ped_crossing": 0
        }
        
        ped_by_direction = {}
        
        try:
            for lane in frame.get("lanes", []):

                vehicles = lane.get("vehicles", {})
                counts["car"] += vehicles.get("cars_count", 0)
                counts["truck"] += vehicles.get("trucks_count", 0)
                counts["motorcycle"] += vehicles.get("motorcycles_count", 0)
                
                counts["car_crossing"] += vehicles.get("cars_passed", 0)
                counts["truck_crossing"] += vehicles.get("trucks_passed", 0)
                counts["motorcycle_crossing"] += vehicles.get("motorcycles_passed", 0)
                
                bus_data = lane.get("bus", {})
                counts["bus"] += bus_data.get("bus_count", 0)
                counts["bus_crossing"] += bus_data.get("bus_passed", 0)
                
                ev_data = lane.get("emergency_vehicles", {})
                counts["emergency"] += ev_data.get("emergency_vehicles_count", 0)
                counts["emergency_crossing"] += ev_data.get("emergency_vehicles_passed", 0)
                
                for ped in lane.get("pedestrians", []):
                    if not isinstance(ped, dict):
                        continue
                    ped_direction = str(ped.get("direction") or "UNKNOWN")
                    ped_waiting = SimulationManager._safe_int(ped.get("ped_count", 0))
                    ped_crossing = 0
                    for k in ("crossing", "crossing_count", "ped_crossing", "ped_crossing_count", "pedestrians_crossing_count", "crosswalk_crossing_count"):
                        if k in ped:
                            ped_crossing = SimulationManager._safe_int(ped.get(k, 0))
                            break

                    candidate = (ped_waiting, ped_crossing)
                    previous = ped_by_direction.get(ped_direction)
                    if previous is None or candidate > previous:
                        ped_by_direction[ped_direction] = candidate

            counts["pedestrians"] = sum(waiting for waiting, _ in ped_by_direction.values())
            counts["ped_crossing"] = sum(crossing for _, crossing in ped_by_direction.values())
        except Exception:
            pass
        
        return counts



    def run(
        self,
        sim_time,
        mode="fixed",
        ev_preemption=False,
        use_priority=False,
        priority_system=None,
        ped_handler=None,
        config_name=None,
        strict_start_boundary=False,
        use_gui=False,
        gui_rotate_deg=0.0,
        json_start_datetime=None,
        json_frames=None,
        is_stream=False,
    ):
        self._close_sumo_connection()
        run_name = config_name if config_name else f"{mode}_{'with_preempt' if ev_preemption else 'no_preempt'}{'_priority' if use_priority else ''}"
        # Update logger for the specific run
        self.logger.mode = run_name
        self.logger.ev_preemption = ev_preemption
        self.preemption_force_switches = 0
        self.preemption_holds = 0
        
        sumo_binary = "sumo-gui" if use_gui else "sumo"
        traci_args = [sumo_binary, "-c", self.sumocfg, "--no-warnings"]
        if use_gui:
            gui_settings_file = os.path.join(os.path.dirname(self.sumocfg), "gui-settings.xml")
            if not os.path.exists(gui_settings_file):
                with open(gui_settings_file, "w") as f:
                    f.write('<viewsettings>\n    <scheme name="real world">\n        <persons personMode="0" personExaggeration="2.0" person_exaggeration="2.0" minSize="2.0" person_minSize="2.0" drawWithConstantSize="1" person_constantSize="1" />\n    </scheme>\n</viewsettings>')
            traci_args.extend(["--gui-settings-file", gui_settings_file, "--delay", "50"])

        traci.start(traci_args)
        self.rotate_gui_view_clockwise(gui_rotate_deg)
        tl_id = "center"

        if is_stream:
            for vtype in ["car", "truck", "motorcycle", "bus", "emergency"]:
                self.object_pools[vtype] = deque([f"pool_{vtype}_{i}" for i in range(1000)])
            self.object_pools["pedestrian"] = deque([f"pool_ped_{i}" for i in range(1000)])

        logics = traci.trafficlight.getAllProgramLogics(tl_id)
        active_logic = next((l for l in logics if l.programID == "fixed_time"), logics[0])
        traci.trafficlight.setProgram(tl_id, active_logic.programID)

        if strict_start_boundary:
            traci.trafficlight.setPhase(tl_id, 0)
            traci.trafficlight.setPhaseDuration(tl_id, active_logic.phases[0].duration)

        traffic_light_setup = TrafficLightSetup(tl_id)
        phase_tracker = PhaseTracker(traffic_light_setup)
        self.data_collector = DataCollector()
        
        # Dynamically determine phase mapping based on link logic
        ns_phase, ew_phase, ped_phase = traffic_light_setup.get_phase_mapping()
        
        controlled_lanes = traci.trafficlight.getControlledLanes(tl_id)
        ns_lanes = list(dict.fromkeys([l for l in controlled_lanes if l.startswith(("N2C", "S2C"))]))
        ew_lanes = list(dict.fromkeys([l for l in controlled_lanes if l.startswith(("W2C", "E2C"))]))

        self.integrator = AdaptiveIntegrator(self.logger, priority_system, ped_handler)
        allow_dynamic_ped_control = (mode == "adaptive")

        logic = active_logic
        
        # Apply dynamic initial TLS program if configured
        tls_config = self.network_config.get("initial_tls_program", {})
        if tls_config:
            g_dur = tls_config.get("green_duration")
            g_np_dur = tls_config.get("green_no_ped_duration")
            y_dur = tls_config.get("yellow_duration")
            
            # Dynamic phase mapping to support any number of phases
            ns_green_phases = []
            ew_green_phases = []
            ns_yellow_phases = []
            ew_yellow_phases = []
            ped_phases = []
            
            for i, phase in enumerate(logic.phases):
                state = phase.state
                if traffic_light_setup.is_ns_green(state):
                    ns_green_phases.append(i)
                elif traffic_light_setup.is_ew_green(state):
                    ew_green_phases.append(i)
                elif traffic_light_setup.is_ns_yellow(state):
                    ns_yellow_phases.append(i)
                elif traffic_light_setup.is_ew_yellow(state):
                    ew_yellow_phases.append(i)
                elif traffic_light_setup.is_ped_green(state):
                    ped_phases.append(i)

            if g_dur and g_np_dur and y_dur:
                # RESET ALL DURATIONS FIRST to ensure no leftovers from default programs
                for phase in logic.phases: phase.duration = 0

                # Apply NS Green
                if ns_green_phases:
                    logic.phases[ns_green_phases[0]].duration = g_dur

                # Apply EW Green
                if ew_green_phases:
                    logic.phases[ew_green_phases[0]].duration = g_np_dur

                # Apply Ped Green
                if ped_phases:
                    logic.phases[ped_phases[0]].duration = g_np_dur

                # Apply Yellows
                for idx in ns_yellow_phases + ew_yellow_phases:
                    logic.phases[idx].duration = y_dur

                # Apply All-Red Clearance
                for i, phase in enumerate(logic.phases):
                    if i not in ns_green_phases + ew_green_phases + ped_phases + ns_yellow_phases + ew_yellow_phases:
                        logic.phases[i].duration = 3

                traci.trafficlight.setProgramLogic(tl_id, logic)
                self.logger.log_event(0, self.logger.mode, ev_preemption, "SYSTEM", "SYSTEM", 
                                    f"Applied dynamic TLS: NS_G={g_dur}s (Idx {ns_green_phases}), "
                                    f"EW_G={g_np_dur}s (Idx {ew_green_phases}), PED_G={g_np_dur}s (Idx {ped_phases}), Y={y_dur}s")

        # Re-fetch active logic to confirm overrides and store for output
        active_logic = traci.trafficlight.getAllProgramLogics(tl_id)[0]
        self.initial_green = g_dur if g_dur else getattr(active_logic.phases[0], 'duration', 0)
        self.initial_yellow = y_dur if y_dur else getattr(active_logic.phases[1], 'duration', 0)
        # Red is defined as the EW Green duration
        self.initial_red = g_np_dur if g_np_dur else (sum(p.duration for p in active_logic.phases) - self.initial_green)

        # Log dynamic mappings to preemption_events.txt
        ped_log = f", PED: {ped_phase}" if ped_phase is not None else ""
        self.logger.log_event(0, self.logger.mode, ev_preemption, "SIMULATION_START", "SYSTEM", f"Dynamically mapped phases -> NS: {ns_phase}, EW: {ew_phase}{ped_log}")


        adaptive_config = self._get_adaptive_config()
        preempt_policy = self.network_config.get("ev_preemption_policy", {})
        self.strict_min_green = preempt_policy.get("strict_min_green", True)
        self.min_green_time_preempt = float(preempt_policy.get("min_green_time_preempt", 20.0))
        ped_policy = self.network_config.get("pedestrian_control", {})
        self.ped_safety_min_green = float(ped_policy.get("ped_safety_min_green", 15.0))
        
        self.logger.log_event(0, "SYSTEM", False, "STABILITY", "ALL", 
                            f"Stability Enforced: strict_min_green={self.strict_min_green}, min_green_preempt={self.min_green_time_preempt}s")
        
        dynamic_red_config = adaptive_config.get("dynamic_max_red", {})

        if mode == "adaptive":
            self.traffic_light_controller = AdaptiveController(
                self.lane_timings,
                self.logger,
                self.integrator,
                dynamic_red_config=dynamic_red_config,
                adaptive_config=adaptive_config,
                start_datetime=json_start_datetime
            )
            self.integrator.set_controller(self.traffic_light_controller)
        else:
            self.traffic_light_controller = FixedTimeController(self.lane_timings, self.logger)
            
        self.traffic_light_controller.ns_phase = ns_phase
        self.traffic_light_controller.ew_phase = ew_phase
        self.traffic_light_controller.ped_phase = ped_phase
        
        starvation_monitor = StarvationMonitor(
            self.logger,
            ns_idx=ns_phase,
            ew_idx=ew_phase,
            dynamic_red_config=dynamic_red_config,
        )
        durations = DurationTracker()
        qdr_tracker = QDRTracker(ns_lanes, ew_lanes)
        
        emissions_log = os.path.join(os.path.dirname(self.log_path), "emissions_log.txt")
        emission_tracker = EmissionTracker(emissions_log)
        
        step_log_file = os.path.join(os.path.dirname(self.log_path), "step_by_step_log.txt")
        with open(step_log_file, "a") as f:
            f.write(f"\n--- NEW SIMULATION RUN: {run_name.upper()} ---\n")

        total_ped_collisions = 0
        ns_green_to_red = 0
        ew_green_to_red = 0
        ns_saw_green = False
        ew_saw_green = False
        
        # Determine initial TLS state to avoid counting a mid-phase start as a switch
        initial_state = traci.trafficlight.getRedYellowGreenState(tl_id)
        if traffic_light_setup.is_ns_green(initial_state): ns_saw_green = True
        if traffic_light_setup.is_ew_green(initial_state): ew_saw_green = True
        total_starvation_events = 0
        self.total_pedestrians_spawned = 0
        self.total_vehicles_spawned = 0
        preemption_active_start_time = None
        starvation_active_start_time = None
        self.total_vehicle_type_counts = {
            "car": 0,
            "truck": 0,
            "motorcycle": 0,
            "bus": 0,
            "emergency": 0,
            "other": 0,
        }
        seen_peds = set()
        seen_vehicle_ids = set()

        # Setup for dynamic stream injection
        stream_state = {}
        veh_id_counter = 0
        ped_id_counter = 0
        last_step_starvation = False
        last_step_preempt_switch = False
        last_step_preempt_hold = False
        last_step_relief = False
        self.preemption_relief_triggers = 0
        self.preemption_force_switches = 0
        self.preemption_holds = 0
        
        available_edges = set(traci.edge.getIDList())
        available_routes = set(traci.route.getIDList())
        stream_crossing_edges = sorted(
            edge_id for edge_id in available_edges if edge_id.startswith(":") and "_c" in edge_id
        )
        stream_waiting_area_edges = sorted(
            edge_id for edge_id in available_edges if edge_id.startswith(":") and "_w" in edge_id
        )

        def _resolve_stream_vehicle_direction(primary, fallback):
            for candidate in (primary, fallback):
                if (
                    candidate["from"] in available_edges
                    and candidate["to"] in available_edges
                    and candidate["route"] in available_routes
                ):
                    return dict(candidate)
            return None

        def _resolve_stream_ped_direction(primary, fallback):
            for candidate in (primary, fallback):
                if candidate["from"] in available_edges and candidate["to"] in available_edges:
                    return dict(candidate)
            return None

        stream_edge_mapping = {
            "SOUTHTONORTH": _resolve_stream_vehicle_direction(
                {"from": "S2C", "to": "C2N", "route": "route_SOUTHTONORTH"},
                {"from": "S2C", "to": "C2N", "route": "route_SOUTHTONORTH"},
            ),
            "NORTHTOSOUTH": _resolve_stream_vehicle_direction(
                {"from": "N2C", "to": "C2S", "route": "route_NORTHTOSOUTH"},
                {"from": "N2C", "to": "C2S", "route": "route_NORTHTOSOUTH"},
            ),
            "EASTTOWEST": _resolve_stream_vehicle_direction(
                {"from": "E2C", "to": "C2W", "route": "route_EASTTOWEST"},
                {"from": "N2C", "to": "C2S", "route": "route_NORTHTOSOUTH"},
            ),
            "WESTTOEAST": _resolve_stream_vehicle_direction(
                {"from": "W2C", "to": "C2E", "route": "route_WESTTOEAST"},
                {"from": "S2C", "to": "C2N", "route": "route_SOUTHTONORTH"},
            ),
        }
        stream_ped_edge_mapping = {
            "EASTTOWEST": _resolve_stream_ped_direction(
                {"from": "E2C", "to": "C2W"},
                {"from": "N2C", "to": "C2S"},
            ),
            "WESTTOEAST": _resolve_stream_ped_direction(
                {"from": "W2C", "to": "C2E"},
                {"from": "S2C", "to": "C2N"},
            ),
            "SOUTHTONORTH": _resolve_stream_ped_direction(
                {"from": "S2C", "to": "C2N"},
                {"from": "S2C", "to": "C2N"},
            ),
            "NORTHTOSOUTH": _resolve_stream_ped_direction(
                {"from": "N2C", "to": "C2S"},
                {"from": "N2C", "to": "C2S"},
            ),
        }

        def _resolve_waiting_area(primary, fallback):
            for edge_id in (primary, fallback):
                if edge_id in stream_waiting_area_edges:
                    return edge_id
            return stream_waiting_area_edges[0] if stream_waiting_area_edges else None

        stream_ped_waiting_mapping = {
            "EASTTOWEST": _resolve_waiting_area(":n_w0", ":s_w0"),
            "WESTTOEAST": _resolve_waiting_area(":s_w0", ":n_w0"),
            "NORTHTOSOUTH": _resolve_waiting_area(":n_w0", ":s_w0"),
            "SOUTHTONORTH": _resolve_waiting_area(":s_w0", ":n_w0"),
        }

        def _append_stream_ped_crossing_stage(ped_id, ped_edges):
            if stream_crossing_edges:
                try:
                    traci.person.appendWalkingStage(ped_id, [stream_crossing_edges[0]], arrivalPos=-1.0)
                    return
                except traci.TraCIException:
                    pass
            traci.person.appendWalkingStage(ped_id, [ped_edges["from"], ped_edges["to"]], arrivalPos=-1.0)

        try:
            # Initial lane subscriptions for performance
            all_monitored_lanes = list(set((ns_lanes or []) + (ew_lanes or [])))
            for l_id in all_monitored_lanes:
                traci.lane.subscribe(l_id, [
                    tc.LAST_STEP_VEHICLE_HALTING_NUMBER, 
                    tc.LAST_STEP_OCCUPANCY,
                    tc.VAR_WAITING_TIME,
                    tc.LAST_STEP_VEHICLE_NUMBER
                ])

            with open(step_log_file, "a") as log_f:
                for step in range(sim_time + 1):

                    for v in traci.simulation.getDepartedIDList():
                        traci.vehicle.subscribe(v, [
                            tc.VAR_CO2EMISSION, tc.VAR_FUELCONSUMPTION, tc.VAR_ROAD_ID, 
                            tc.VAR_WAITING_TIME, tc.VAR_SPEED, tc.VAR_TYPE, tc.VAR_VEHICLECLASS,
                            tc.VAR_TIMELOSS
                        ])
                    for p in traci.simulation.getDepartedPersonIDList():
                        traci.person.subscribe(p, [tc.VAR_WAITING_TIME, tc.VAR_ROAD_ID])

                    vehicle_data = traci.vehicle.getAllSubscriptionResults()
                    person_data = traci.person.getAllSubscriptionResults()
                    lane_data = traci.lane.getAllSubscriptionResults()
                    
                    current_time = traci.simulation.getTime()
                    frame = json_frames[step] if json_frames and step < len(json_frames) else None
                    frame_counts = None
                    if frame is not None:
                        frame_counts = self._extract_json_frame_counts(frame)
                    
                    ns_queue = QueueCalculator.calculate_queue(ns_lanes, lane_data)
                    ew_queue = QueueCalculator.calculate_queue(ew_lanes, lane_data)

                    ns_is_g = phase_tracker.is_ns_green()
                    ew_is_g = phase_tracker.is_ew_green()
                    
                    qdr_tracker.update(step, ns_lanes, ew_lanes, ns_is_g, ew_is_g, lane_data)

                    passed_evs, passed_buses = [], []
                    if priority_system:
                        passed_evs = priority_system.track_emergencies(step)
                        passed_buses = priority_system.track_buses(step)

                    state = traci.trafficlight.getRedYellowGreenState(tl_id)
                    is_transitioning = 'y' in state.lower()
                    starvation_triggered = False
                    incident_triggered = False

                    if not is_transitioning:
                        # HARD PREEMPTION
                        preempt_action = None
                        if ev_preemption and priority_system:
                            preempt_action = priority_system.process_preemption(step, ns_is_g, ew_is_g, traffic_light_setup)
                            if preempt_action:
                                self.traffic_light_controller.apply_action(
                                    preempt_action,
                                    strict_min_green=self.strict_min_green,
                                    min_green_time=self.min_green_time_preempt,
                                    phase_tracker=phase_tracker,
                                    current_time=current_time
                                )
                                if preempt_action.get("type") == "force_switch":
                                    if not last_step_preempt_switch:
                                        self.preemption_force_switches += 1
                                    if mode == "adaptive": 
                                        self.integrator.sync_on_external_switch(current_time)
                                elif preempt_action.get("type") == "hold_green":
                                    if not last_step_preempt_hold:
                                        self.preemption_holds += 1
                        
                        if priority_system and priority_system.relief_direction:
                            if not last_step_relief:
                                self.preemption_relief_triggers += 1

                        # PEDESTRIAN PREEMPTION
                        ped_action = None
                        if (
                            allow_dynamic_ped_control
                            and not preempt_action
                            and ped_handler
                            and self.traffic_light_controller.ped_phase is not None
                        ):
                            # Ensure we don't rapid-fire switch by checking min green
                            time_in_phase = phase_tracker.get_time_in_phase(current_time)
                            min_green_met = time_in_phase >= self.ped_safety_min_green
                            is_ped_phase = (phase_tracker.current_green_direction == "PED")
                            
                            ped_action = ped_handler.check_pedestrian_preemption(step, current_time, ns_lanes, ew_lanes, min_green_met, is_ped_phase, time_in_phase, use_priority=use_priority)
                            if ped_action:
                                success = self.traffic_light_controller.apply_action(
                                    ped_action,
                                    strict_min_green=self.strict_min_green,
                                    min_green_time=self.ped_safety_min_green,
                                    phase_tracker=phase_tracker,
                                    current_time=current_time
                                )
                                if success:
                                    ped_handler.confirm_ped_action(current_time, ped_action)
                                    if mode == "adaptive" and ped_action.get("type") == "force_switch": self.integrator.sync_on_external_switch(current_time)

                        # ADAPTIVE LOGIC (Weights)
                        if mode == "adaptive" and not preempt_action and not ped_action:
                            action = self.traffic_light_controller.get_adaptive_action(
                                current_time, phase_tracker, ns_lanes, ew_lanes, 
                                use_priority=use_priority, qdr_tracker=qdr_tracker,
                                lane_data=lane_data
                            )
                            if action: 
                                self.traffic_light_controller.apply_action(action)
                                if action.get("reason") == "incident_blockage":
                                    incident_triggered = True

                        # SAFETY
                        if mode == "adaptive" and not preempt_action and not ped_action:
                            starve = starvation_monitor.check_starvation(
                                durations, ns_is_g, ew_is_g, qdr_tracker,
                                ns_lanes=ns_lanes, ew_lanes=ew_lanes
                            )
                            if starve: 
                                self.traffic_light_controller.apply_action(
                                    starve,
                                    strict_min_green=self.strict_min_green,
                                    min_green_time=self.min_green_time_preempt,
                                    phase_tracker=phase_tracker,
                                    current_time=current_time
                                )
                                if mode == "adaptive": self.integrator.sync_on_external_switch(current_time)
                                if not last_step_starvation:
                                    total_starvation_events += 1
                    starvation_monitor.update_compensation_status(ns_is_g, ew_is_g)
                    starvation_triggered = (starvation_monitor.ns_starved or starvation_monitor.ew_starved)

                    # PROCESS DATA USING CACHED RESULTS
                    emission_tracker.update(vehicle_data)
                    traci.simulationStep()
                    current_time = traci.simulation.getTime()
                    
                    # Track newly appeared/disappeared entities for statistics
                    self.total_vehicles_spawned += len(traci.simulation.getDepartedIDList())
                    for v_id, data in vehicle_data.items():
                        if v_id not in seen_vehicle_ids:
                            seen_vehicle_ids.add(v_id)
                            v_type = data.get(tc.VAR_TYPE, "other")
                            bucket = self._bucket_vehicle_type(v_type)
                            self.total_vehicle_type_counts[bucket] = self.total_vehicle_type_counts.get(bucket, 0) + 1
                    
                    for ped_id in person_data:
                        if ped_id not in seen_peds:
                            seen_peds.add(ped_id)
                            self.total_pedestrians_spawned += 1
                    
                    active_person_ids = set(person_data.keys())
                    seen_peds &= active_person_ids
                    
                    for c in traci.simulation.getCollisions():
                        if c.colliderType == "pedestrian" or c.victimType == "pedestrian" or "person" in c.collider or "person" in c.victim:
                            total_ped_collisions += 1
                            log_f.write(f"⚠️ COLLISION DETECTED: {c.collider} struck {c.victim} at step {step}!\n")
                    
                    phase_tracker.update(current_time)
                    ns_is_g = phase_tracker.is_ns_green()
                    ew_is_g = phase_tracker.is_ew_green()
                    durations.update(ns_is_g, ew_is_g)
                    
                    current_state = traci.trafficlight.getRedYellowGreenState(tl_id)
                    
                    if traffic_light_setup.is_ns_green(current_state): ns_color = "green"
                    elif traffic_light_setup.is_ns_yellow(current_state) or traffic_light_setup.is_ew_yellow(current_state): ns_color = "yellow"
                    else: ns_color = "red"
                        
                    if traffic_light_setup.is_ew_green(current_state): ew_color = "green"
                    elif traffic_light_setup.is_ew_yellow(current_state) or traffic_light_setup.is_ns_yellow(current_state): ew_color = "yellow"
                    else: ew_color = "red"

                    if ns_color == "green":
                        ns_saw_green = True
                    elif ns_color == "red" and ns_saw_green:
                        ns_green_to_red += 1
                        ns_saw_green = False

                    if ew_color == "green":
                        ew_saw_green = True
                    elif ew_color == "red" and ew_saw_green:
                        ew_green_to_red += 1
                        ew_saw_green = False

                    # Collect and report live data
                    metrics = getattr(self.traffic_light_controller, "metrics", {}) or {}
                    metrics["preemption_force_switches"] = self.preemption_force_switches
                    metrics["preemption_holds"] = self.preemption_holds
                    metrics["preemption_interruptions"] = self.preemption_relief_triggers
                    metrics["preemption_switches"] = self.preemption_force_switches
                    metrics["starvation_events"] = total_starvation_events
                    
                    is_preempt = (priority_system and priority_system.preempt_active)
                    if is_preempt:
                        if preemption_active_start_time is None:
                            preemption_active_start_time = current_time
                        metrics["preemption_events"] = current_time - preemption_active_start_time
                    else:
                        preemption_active_start_time = None
                        metrics["preemption_events"] = 0
                        
                    if starvation_triggered:
                        if starvation_active_start_time is None:
                            starvation_active_start_time = current_time
                        metrics["starvation_events"] = current_time - starvation_active_start_time
                    else:
                        starvation_active_start_time = None
                        metrics["starvation_events"] = 0
                        
                    metrics["event_preemption_active"] = 1 if is_preempt else 0
                    metrics["event_starvation_active"] = 1 if starvation_triggered else 0
                    metrics["ped_collisions"] = total_ped_collisions
                    metrics["ns_green_to_red"] = ns_green_to_red
                    metrics["ew_green_to_red"] = ew_green_to_red

                    ped_waiting_now, ped_crossing_now, ped_other_now = self._count_live_pedestrian_states(
                        person_data,
                        waiting_edges=stream_waiting_area_edges,
                        crossing_edges=stream_crossing_edges,
                    )
                        
                    metrics["ns_qdr"] = qdr_tracker.get_stats("NS")["recent"]
                    metrics["ew_qdr"] = qdr_tracker.get_stats("EW")["recent"]
                    metrics["throughput"] = traci.simulation.getArrivedNumber()

                    active_counts = self._count_active_vehicles_by_type(vehicle_data)
                    metrics["car_count"] = active_counts.get("car", 0)
                    metrics["truck_count"] = active_counts.get("truck", 0)
                    metrics["motorcycle_count"] = active_counts.get("motorcycle", 0)
                    metrics["bus_count"] = active_counts.get("bus", 0)
                    metrics["emergency_vehicle_count"] = active_counts.get("emergency", 0)

                    ns_lane_utilization = self._calculate_lane_utilization(ns_lanes, lane_data)
                    ew_lane_utilization = self._calculate_lane_utilization(ew_lanes, lane_data)
                    metrics["ns_lane_utilization"] = ns_lane_utilization
                    metrics["ew_lane_utilization"] = ew_lane_utilization
                    metrics["lane_utilization"] = (ns_lane_utilization + ew_lane_utilization) / 2 if (ns_lanes or ew_lanes) else 0.0
                    
                    if frame_counts is not None:
                        metrics.update({f"queue_{k}": v for k, v in frame_counts.items() if "_" not in k})
                        metrics.update({f"crossing_{k.replace('_crossing', '')}": v for k, v in frame_counts.items() if "_crossing" in k})

                    metrics["unique_pedestrians"] = self.total_pedestrians_spawned
                    metrics["ped_count"] = ped_waiting_now
                    metrics["ped_crossing"] = ped_crossing_now
                    metrics["ped_time_saved"] = ped_handler.total_time_saved if ped_handler else 0.0
                    metrics["ped_collisions"] = total_ped_collisions
                    metrics["step_co2"] = emission_tracker.current_step_co2 / 1000.0  
                    metrics["step_fuel"] = emission_tracker.current_step_fuel / 1000.0 
                    metrics["total_co2"] = emission_tracker.total_co2_mg / 1000.0
                    metrics["total_fuel"] = emission_tracker.total_fuel_mg / 1000.0
                    metrics["starvation_events"] = total_starvation_events
                    metrics["preemption_force_switches"] = self.preemption_force_switches
                    metrics["preemption_holds"] = self.preemption_holds
                    metrics["total_spawned"] = self.total_vehicles_spawned
                    metrics["total_peds_spawned"] = self.total_pedestrians_spawned
                    
                    data = self.data_collector.collect_step_data(
                        step, ns_queue, ew_queue, ns_is_g, ew_is_g, metrics, ns_color, ew_color,
                        vehicle_data=vehicle_data, person_data=person_data
                    )
                    
                    active_dir = phase_tracker.current_green_direction if phase_tracker.current_green_direction else "NONE"
                    if 'y' in state.lower(): phase_color, phase_emoji = "Yellow", "🟡"
                    elif 'g' in state.lower():
                        phase_color = "Green"
                        phase_emoji = "🔴" if active_dir == "EW" else "🟢"
                    else: phase_color, phase_emoji = "Red", "🔴"

                    pass_events = ""
                    if passed_evs: pass_events += f" | 🚨 Passed: {','.join(passed_evs)}"
                    if passed_buses: pass_events += f" | 🚌 Passed: {','.join(passed_buses)}"
                    
                    current_live_peds = len(person_data)
                    ped_info = (f" | 🚶 Crossing: {ped_handler.get_crossing_pedestrians()}" if active_dir == "PED" and ped_handler else "")
                    ped_info += f" | 🧑‍🤝‍🧑 Unique Spawned: {self.total_pedestrians_spawned} | 👣 Live: {current_live_peds}"
                    
                    qdr_info = f" | QDR MA: NS {qdr_tracker.get_stats('NS')['moving_avg']:.2f}, EW {qdr_tracker.get_stats('EW')['moving_avg']:.2f}"
                    starve_info = " | ⚡ STARVATION COMPENSATED" if starvation_triggered else ""
                    incident_info = " | 🛑 INCIDENT BLOCKAGE DETECTED" if incident_triggered else ""

                    log_f.write(f"{phase_emoji} [{run_name}] Step #{step:4} | Phase: {phase_color:6} ({active_dir:4}) | Wait: {data['v_wait_avg']:5.1f}s | EV Wait: {data['ev_wait_avg']:5.1f}s | PT Wait: {data['pt_wait_avg']:5.1f}s | Ped Wait: {data['p_wait_avg']:5.1f}s | Q: {ns_queue+ew_queue}{pass_events}{ped_info}{qdr_info}{starve_info}{incident_info}\n")
                    last_step_starvation = starvation_triggered
                    last_step_preempt_switch = (preempt_action is not None and preempt_action.get("type") == "force_switch")
                    last_step_preempt_hold = (preempt_action is not None and preempt_action.get("type") == "hold_green")
                    last_step_relief = (priority_system is not None and priority_system.relief_direction is not None)

                    # Console status
                    phase_elapsed = int(phase_tracker.get_time_in_phase(current_time))
                    if frame_counts is not None:
                        veh_car, veh_truck, veh_moto, veh_bus, veh_ev = frame_counts["car"], frame_counts["truck"], frame_counts["motorcycle"], frame_counts["bus"], frame_counts["emergency"]
                    else:
                        veh_car, veh_truck, veh_moto, veh_bus, veh_ev = active_counts.get("car", 0), active_counts.get("truck", 0), active_counts.get("motorcycle", 0), active_counts.get("bus", 0), active_counts.get("emergency", 0)
                    
                    print(f"[{run_name}] SimStep={step:4d} | Light: {ns_color.capitalize()} {phase_elapsed}s | Queue: car={veh_car} truck={veh_truck} moto={veh_moto} bus={veh_bus} ev={veh_ev} ped={ped_waiting_now}")
            
            # Save emissions data
            emission_tracker.save_results(run_name)
            emissions_summary = emission_tracker.totals.copy()
            emissions_summary["net_total"] = {
                "co2_g": emission_tracker.total_co2_mg / 1000.0,
                "fuel_g": emission_tracker.total_fuel_mg / 1000.0
            }

        finally:
            self._close_sumo_connection()

        # Get cumulative stats from PrioritySystem
        ev_stats = (0.0, 0.0, 0.0, [])
        pt_stats = (0.0, 0.0, 0.0, [])
        if priority_system:
            ev_stats = priority_system.get_emergency_stats()
            pt_stats = priority_system.get_bus_stats()
        
        lifecycle_stats = self.data_collector.get_lifecycle_stats()

        return self.data_collector.get_results(), self.data_collector.get_history(), total_ped_collisions, total_starvation_events, emissions_summary, ev_stats, pt_stats, lifecycle_stats