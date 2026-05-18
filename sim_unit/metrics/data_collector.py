import traci
from collections import defaultdict, deque

class DataCollector:
    def __init__(self, collect_frequency=5):
        self.history = []
        self.results = []
        self.collect_frequency = collect_frequency
        self.last_collect_step = -collect_frequency
        self._observed_incoming_lanes = None
        self._observed_outgoing_lanes = None
        self._max_ns_queue = 0
        self._max_ew_queue = 0
        self._max_total_queue = 0
        self.vehicle_speeds = {}
        self.total_vehicle_stops = 0
        self.veh_static_cache = {}
        
        self.unique_vehicles_seen = set()
        self.unique_peds_seen = set()
        self.unique_exits_seen = set()
        
        self.vehicle_max_waits = {} 
        self.reg_max_waits = {} 
        self.ev_max_waits = {} 
        self.pt_max_waits = {} 
        self.ped_max_waits = {} 
        
        self.vehicle_max_waits_sum = 0.0
        self.reg_max_waits_sum = 0.0
        self.ev_max_waits_sum = 0.0
        self.pt_max_waits_sum = 0.0
        self.ped_max_waits_sum = 0.0
        
        self.new_arrivals_this_step = defaultdict(int)
        self.new_exits_this_step = defaultdict(int)
        self.new_peds_this_step = 0

    def _refresh_observed_lanes(self):
        if self._observed_incoming_lanes is not None:
            return
            
        try:
            lane_ids = traci.lane.getIDList()
        except traci.TraCIException:
            return

        self._observed_incoming_lanes = [
            l for l in lane_ids if l.startswith(("N2C_", "S2C_", "E2C_", "W2C_")) and ":" not in l
        ]
        self._observed_outgoing_lanes = [
            l for l in lane_ids if l.startswith(("C2N_", "C2S_", "C2E_", "C2W_")) and ":" not in l
        ]

    def collect_step_data(
        self,
        step,
        ns_queue,
        ew_queue,
        ns_is_g,
        ew_is_g,
        controller_metrics=None,
        ns_light_status=None,
        ew_light_status=None,
        vehicle_data=None,
        person_data=None
    ):
        metric = controller_metrics or {}
        vehicle_data = vehicle_data or {}
        person_data = person_data or {}
        
        # Update unique tracking AND get active occupancy
        regular_v, evs, buses, active_counts, ns_active_count, ew_active_count = self._update_metrics_and_tracking(vehicle_data)
        
        # Basic stats
        avgs, maxs, totals = self._calculate_vehicle_stats(regular_v, evs, buses, vehicle_data)
        v_wait, ev_wait, pt_wait, all_v_wait = avgs
        v_wait_max, ev_wait_max, pt_wait_max, all_v_wait_max = maxs
        p_wait_avg, p_wait_max, p_wait_total = self._calculate_pedestrian_stats(person_data)

        # Track max waits
        for v_id, data in vehicle_data.items():
            wait = data.get(traci.constants.VAR_WAITING_TIME, 0)
            v_type = data.get(traci.constants.VAR_TYPE, "").lower()
            
            old_max = self.vehicle_max_waits.get(v_id, 0.0)
            if wait > old_max:
                self.vehicle_max_waits_sum += (wait - old_max)
                self.vehicle_max_waits[v_id] = wait
            
            if "emergency" in v_type:
                old_ev_max = self.ev_max_waits.get(v_id, 0.0)
                if wait > old_ev_max:
                    self.ev_max_waits_sum += (wait - old_ev_max)
                    self.ev_max_waits[v_id] = wait
            elif "bus" in v_type or "pt" in v_type:
                old_pt_max = self.pt_max_waits.get(v_id, 0.0)
                if wait > old_pt_max:
                    self.pt_max_waits_sum += (wait - old_pt_max)
                    self.pt_max_waits[v_id] = wait
            else:
                old_reg_max = self.reg_max_waits.get(v_id, 0.0)
                if wait > old_reg_max:
                    self.reg_max_waits_sum += (wait - old_reg_max)
                    self.reg_max_waits[v_id] = wait
        
        for p_id, data in person_data.items():
            wait = data.get(traci.constants.VAR_WAITING_TIME, 0)
            old_max = self.ped_max_waits.get(p_id, 0.0)
            if wait > old_max:
                self.ped_max_waits_sum += (wait - old_max)
                self.ped_max_waits[p_id] = wait

        all_vehicles_in_net = list(vehicle_data.keys())
        sum_time_loss = 0.0
        for v in all_vehicles_in_net:
            data = vehicle_data.get(v, {})
            speed = data.get(traci.constants.VAR_SPEED, 10.0)
            if speed < 0.1 and self.vehicle_speeds.get(v, 10.0) >= 0.1:
                self.total_vehicle_stops += 1
            self.vehicle_speeds[v] = speed
            
            sum_time_loss += data.get(traci.constants.VAR_TIMELOSS, 0.0)
        
        avg_time_loss = sum_time_loss / len(all_vehicles_in_net) if all_vehicles_in_net else 0.0
        
        # Running lifecycle averages
        v_life_avg = self.vehicle_max_waits_sum / len(self.vehicle_max_waits) if self.vehicle_max_waits else 0.0
        p_life_avg = self.ped_max_waits_sum / len(self.ped_max_waits) if self.ped_max_waits else 0.0
        ev_life_avg = self.ev_max_waits_sum / len(self.ev_max_waits) if self.ev_max_waits else 0.0
        pt_life_avg = self.pt_max_waits_sum / len(self.pt_max_waits) if self.pt_max_waits else 0.0
        reg_life_avg = self.reg_max_waits_sum / len(self.reg_max_waits) if self.reg_max_waits else 0.0

        total_queue = ns_queue + ew_queue
        self._max_ns_queue = max(self._max_ns_queue, ns_queue)
        self._max_ew_queue = max(self._max_ew_queue, ew_queue)
        self._max_total_queue = max(self._max_total_queue, total_queue)

        # Build data point
        data_point = {
            'step': step,
            
            # --- AVERAGE EXPERIENCE (FLOW) ---
            'all_v_wait_avg': all_v_wait,
            'v_wait_avg': v_wait, # Regular
            'ev_wait_avg': ev_wait,
            'pt_wait_avg': pt_wait,
            'p_wait_avg': p_wait_avg,
            
            # --- PEAK DELAYS (OUTLIERS) ---
            'all_v_wait_max': all_v_wait_max,
            'v_wait_max': v_wait_max,
            'ev_wait_max': ev_wait_max,
            'pt_wait_max': pt_wait_max,
            'p_wait_max': p_wait_max,
            
            # --- PRESSURE & AGGREGATE DELAYS ---
            'all_v_wait_total': totals[3],
            'v_wait_total': totals[0],
            'ev_wait_total': totals[1],
            'pt_wait_total': totals[2],
            'p_wait_total': p_wait_total,
            
            # --- INDIVIDUAL TRIP EXPERIENCE (LIFECYCLE) ---
            'v_life_avg': v_life_avg, # All
            'reg_life_avg': reg_life_avg,
            'ev_life_avg': ev_life_avg,
            'pt_life_avg': pt_life_avg,
            'p_life_avg': p_life_avg,

            # --- INFRASTRUCTURE & SATURATION ---
            'queue_total': total_queue,
            'ns_queue': ns_queue,
            'ew_queue': ew_queue,
            'ns_active_count': ns_active_count,
            'ew_active_count': ew_active_count,
            'max_queue_length': self._max_total_queue,
            'max_ns_queue': self._max_ns_queue,
            'max_ew_queue': self._max_ew_queue,
            'ns_green_active': 1 if ns_is_g else 0,
            'ns_light_status': ns_light_status,
            'ew_light_status': ew_light_status,
            
            'counts': {
                'car': active_counts['car'],
                'motorcycle': active_counts['motorcycle'],
                'truck': active_counts['truck'],
                'bus': active_counts['bus'],
                'emergency': active_counts['emergency'],
                'total': sum(active_counts.values())
            },
            'all_v_count': sum(active_counts.values()),
            'car_count': active_counts['car'],
            'motorcycle_count': active_counts['motorcycle'],
            'truck_count': active_counts['truck'],
            'bus_count': active_counts['bus'],
            'emergency_vehicle_count': active_counts['emergency'],
            'pt_count': active_counts['bus'],
            'throughput': metric.get('throughput', 0),

            # --- ARRIVAL DELT--
            'unique_arrival_all': sum(self.new_arrivals_this_step.values()),
            'unique_arrival_car': self.new_arrivals_this_step['car'],
            'unique_arrival_motorcycle': self.new_arrivals_this_step['motorcycle'],
            'unique_arrival_truck': self.new_arrivals_this_step['truck'],
            'unique_arrival_bus': self.new_arrivals_this_step['bus'],
            'unique_arrival_emergency': self.new_arrivals_this_step['emergency'],
            'unique_arrival_ped': self.new_peds_this_step,

            # --- EXIT DELTAS ---
            'unique_exit_all': sum(self.new_exits_this_step.values()),
            'unique_exit_car': self.new_exits_this_step['car'],
            'unique_exit_motorcycle': self.new_exits_this_step['motorcycle'],
            'unique_exit_truck': self.new_exits_this_step['truck'],
            'unique_exit_bus': self.new_exits_this_step['bus'],
            'unique_exit_emergency': self.new_exits_this_step['emergency'],

            'all_v_cleared': metric.get('all_v_cleared', sum(self.new_exits_this_step.values())),
            'crossing_car': metric.get('crossing_car', self.new_exits_this_step['car']),
            'crossing_motorcycle': metric.get('crossing_motorcycle', self.new_exits_this_step['motorcycle']),
            'crossing_truck': metric.get('crossing_truck', self.new_exits_this_step['truck']),
            'crossing_bus': metric.get('crossing_bus', self.new_exits_this_step['bus']),
            'crossing_emergency': metric.get('crossing_emergency', self.new_exits_this_step['emergency']),

            'ped_count': len(person_data),
            'ped_crossing_count': metric.get("ped_crossing", 0),
            'ped_total_count': len(person_data),

            'ns_lane_utilization': metric.get('ns_lane_utilization', 0),
            'ew_lane_utilization': metric.get('ew_lane_utilization', 0),
            'lane_utilization': metric.get('lane_utilization', 0),
            'threshold': metric.get("threshold", 0),
            'ns_weight': metric.get("ns_weight", 0),
            'ew_weight': metric.get("ew_weight", 0),
            'ns_qdr': metric.get("ns_qdr", 0),
            'ew_qdr': metric.get("ew_qdr", 0),
            'ns_congestion': 0.0 if ns_queue <= 2 else min(1.0, ns_queue / 30.0),
            'ew_congestion': 0.0 if ew_queue <= 2 else min(1.0, ew_queue / 30.0),
            'congestion_level': (
                (0.0 if ns_queue <= 2 else min(1.0, ns_queue / 30.0)) +
                (0.0 if ew_queue <= 2 else min(1.0, ew_queue / 30.0))
            ) / 2.0,
            'ns_congestion_demand': 0.0 if ns_queue <= 2 else min(1.0, ns_queue / max(10.0, float(ns_active_count))),
            'ew_congestion_demand': 0.0 if ew_queue <= 2 else min(1.0, ew_queue / max(10.0, float(ew_active_count))),
            'congestion_level_demand': (
                (0.0 if ns_queue <= 2 else min(1.0, ns_queue / max(10.0, float(ns_active_count)))) +
                (0.0 if ew_queue <= 2 else min(1.0, ew_queue / max(10.0, float(ew_active_count))))
            ) / 2.0,
            'ped_time_saved': metric.get("ped_time_saved", 0),
            'total_vehicle_stops': self.total_vehicle_stops,
            'avg_time_loss': avg_time_loss,
            'v_life_avg': v_life_avg,
            'p_life_avg': p_life_avg,
            'preemption_force_switches': metric.get('preemption_force_switches', 0),
            'preemption_holds': metric.get('preemption_holds', 0),
            'preemption_total': metric.get('preemption_force_switches', 0) + metric.get('preemption_holds', 0),
            'ped_collisions': metric.get('ped_collisions', 0),
            'starvation_events': metric.get('starvation_events', 0),
            'event_starvation_active': metric.get('event_starvation_active', 0),
            'event_preemption_active': metric.get('event_preemption_active', 0),
            'preemption_switches': metric.get('preemption_switches', 0),
            'preemption_holds': metric.get('preemption_holds', 0),
            'preemption_interruptions': metric.get('preemption_interruptions', 0),
            'ns_green_to_red': metric.get('ns_green_to_red', 0),
            'ew_green_to_red': metric.get('ew_green_to_red', 0),
            'step_co2': metric.get('step_co2', 0),
            'step_fuel': metric.get('step_fuel', 0),
            'total_co2': metric.get('total_co2', 0),
            'total_fuel': metric.get('total_fuel', 0),
            
            # Summary stats
            'unique_total_vehicles': len(self.unique_vehicles_seen),
            'unique_total_peds': len(self.unique_peds_seen),
            'total_spawned': metric.get('total_spawned', 0),
            'total_peds_spawned': metric.get('total_peds_spawned', 0)
        }

        self.new_arrivals_this_step = defaultdict(int)
        self.new_exits_this_step = defaultdict(int)
        self.new_peds_this_step = 0

        self.results.append(data_point)
        if step - self.last_collect_step >= self.collect_frequency:
            self.history.append(data_point)
            self.last_collect_step = step
        return data_point

    def _update_metrics_and_tracking(self, vehicle_data):
        """Update sets of seen IDs and calculate arrivals/exits + active counts using pre-collected data."""
        self._refresh_observed_lanes()
        regular_v, evs, buses = [], [], []
        active_counts = defaultdict(int)
        ns_active_count = 0
        ew_active_count = 0
        

        if not hasattr(self, '_observed_incoming_edges'):
            self._observed_incoming_edges = set(l.split("_")[0] for l in self._observed_incoming_lanes or [])
            self._observed_outgoing_edges = set(l.split("_")[0] for l in self._observed_outgoing_lanes or [])

        for v_id, data in vehicle_data.items():
            edge = data.get(traci.constants.VAR_ROAD_ID, "")
            
            # Inbound
            if edge in self._observed_incoming_edges:
                if edge in ["N2C", "S2C"]:
                    ns_active_count += 1
                elif edge in ["E2C", "W2C"]:
                    ew_active_count += 1
                    
                if v_id not in self.veh_static_cache:
                    v_type = data.get(traci.constants.VAR_TYPE, "other")
                    v_class = data.get(traci.constants.VAR_VEHICLECLASS, "passenger")
                    self.veh_static_cache[v_id] = {"type": v_type, "class": v_class}
                
                cached = self.veh_static_cache[v_id]
                v_type, v_class = cached["type"], cached["class"]
                
                is_emergency = (v_class == "emergency" or v_type == "emergency" or "emergency" in v_type.lower())
                is_bus = (v_class in ["bus", "coach", "tram", "rail_urban"] or v_type == "bus" or "bus" in v_type.lower() or "pt" in v_type.lower())
                
                if is_emergency:
                    evs.append(v_id)
                    cat = 'emergency'
                elif is_bus:
                    buses.append(v_id)
                    cat = 'bus'
                else:
                    regular_v.append(v_id)
                    cat = v_type
                
                active_counts[cat] += 1
                if v_id not in self.unique_vehicles_seen:
                    self.unique_vehicles_seen.add(v_id)
                    self.new_arrivals_this_step[cat] += 1
            
            # Outbound
            elif edge in self._observed_outgoing_edges:
                if v_id not in self.unique_exits_seen:
                    self.unique_exits_seen.add(v_id)
                    if v_id not in self.veh_static_cache:
                        v_type = data.get(traci.constants.VAR_TYPE, "other")
                        v_class = data.get(traci.constants.VAR_VEHICLECLASS, "passenger")
                        self.veh_static_cache[v_id] = {"type": v_type, "class": v_class}
                    
                    cached = self.veh_static_cache[v_id]
                    v_type, v_class = cached["type"], cached["class"]
                    
                    is_emergency = (v_class == "emergency" or v_type == "emergency" or "emergency" in v_type.lower())
                    is_bus = (v_class in ["bus", "coach", "tram", "rail_urban"] or v_type == "bus" or "bus" in v_type.lower() or "pt" in v_type.lower())
                    
                    if is_emergency: cat = 'emergency'
                    elif is_bus: cat = 'bus'
                    else: cat = v_type
                    self.new_exits_this_step[cat] += 1
                    
        return regular_v, evs, buses, active_counts, ns_active_count, ew_active_count

    def _calculate_vehicle_stats(self, regular_v, evs, buses, vehicle_data):
        v_waits = [vehicle_data.get(v, {}).get(traci.constants.VAR_WAITING_TIME, 0) for v in regular_v]
        ev_waits = [vehicle_data.get(v, {}).get(traci.constants.VAR_WAITING_TIME, 0) for v in evs]
        pt_waits = [vehicle_data.get(v, {}).get(traci.constants.VAR_WAITING_TIME, 0) for v in buses]
        all_waits = v_waits + ev_waits + pt_waits
        
        res_v = self._avg_and_max(v_waits)
        res_ev = self._avg_and_max(ev_waits)
        res_pt = self._avg_and_max(pt_waits)
        res_all = self._avg_and_max(all_waits)
        
        avgs = (res_v[0], res_ev[0], res_pt[0], res_all[0])
        maxs = (res_v[1], res_ev[1], res_pt[1], res_all[1])
        totals = (res_v[2], res_ev[2], res_pt[2], res_all[2])
        return avgs, maxs, totals

    def _calculate_pedestrian_stats(self, person_data):
        for p in person_data:
            if p not in self.unique_peds_seen:
                self.unique_peds_seen.add(p)
                self.new_peds_this_step += 1
        p_waits = [data.get(traci.constants.VAR_WAITING_TIME, 0) for data in person_data.values()]
        return self._avg_and_max(p_waits)

    def _avg_and_max(self, values):
        if not values: return 0.0, 0.0, 0.0
        return sum(values) / len(values), max(values), sum(values)

    def get_results(self): return self.results
    
    def get_lifecycle_stats(self):
        v_vals = list(self.vehicle_max_waits.values())
        p_vals = list(self.ped_max_waits.values())
        
        avg_v = sum(v_vals) / len(v_vals) if v_vals else 0.0
        avg_p = sum(p_vals) / len(p_vals) if p_vals else 0.0
        
        return avg_v, avg_p

    def get_history(self): return self.history

class QueueCalculator:
    @staticmethod
    def calculate_queue(lanes, lane_data):
        total = 0
        for lane_id in lanes:
            data = lane_data.get(lane_id, {})
            total += data.get(traci.constants.LAST_STEP_VEHICLE_HALTING_NUMBER, 0)
        return total
