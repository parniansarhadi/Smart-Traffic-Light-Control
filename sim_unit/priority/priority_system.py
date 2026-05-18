import traci
import os
from collections import deque
from sim_unit.utilities.config_utils import extract_config_params

class PrioritySystem:
    def __init__(self, logger, ev_preemption_enabled=True, policy_config=None, soft_priority_config=None):
        self.logger = logger
        self.ev_preemption_enabled = ev_preemption_enabled
        self.policy_config = policy_config or {}
        
        self.soft_priority_config = {
            "emergency_base_weight": 200.0,
            "emergency_urgent_weight": 320.0,
            "emergency_wait_urgent_s": 15.0,
            "emergency_eta_urgent_s": 10.0,
            "emergency_wait_cap_s": 45.0,
            "emergency_eta_floor_s": 2.0,
            "emergency_wait_gain": 0.8,
            
            "bus_weight_normal": 12.0,
            "bus_weight_stress": 10.0,
            "bus_wait_gain": 0.35,
            "stress_ped_wait_threshold_s": 50.0,
            "stress_debt_threshold": 20.0,
            
            "ped_guard_threshold_s": 50.0,
            "ped_guard_suppression": 0.35,
            "direction_bonus_cap": 500.0,
            
            "fairness_streak_trigger": 3,
            "fairness_penalty": 140.0,
            "fairness_opposite_boost": 60.0,
            "hysteresis_update_steps": 8,
            "hysteresis_persist_cycles": 2,
        }
        if soft_priority_config:
            self.soft_priority_config.update(soft_priority_config)
        
        # Define Weights for "Soft" Priority
        self.weights = {"bus": 20.0, "emergency": 1000.0}
        
        # Preemption State for "Hard" Priority
        self.preempt_active = False
        self.ev_approach_dist = 300 
        self.preempt_direction = None
        self.locked_ev_id = None
        self.locked_ev_direction = None
        self.ev_lock_queue = {}
        self.last_served_direction = None
        self.consecutive_same_direction = 0
        
        # New configurable parameters
        self.recovery_bonus = float(soft_priority_config.get("recovery_bonus", 10000.0))
        self.hard_streak_cap = int(soft_priority_config.get("hard_streak_cap", 2))
        
        self.max_consecutive_same_direction = self.hard_streak_cap
        self.dynamic_max_consecutive_same_direction = self.max_consecutive_same_direction
        self.dynamic_tune_cooldown_steps = 25
        self.dynamic_tune_reverse_guard_steps = 45
        self.dynamic_tune_last_change_step = -10**9
        self.dynamic_tune_last_direction = 0  # +1 means cap increased, -1 means cap decreased
        self.enable_pressure_ratio_smoothing = True
        self.pressure_ratio_history = deque(maxlen=3)
        
        # Extract configuration parameters using config_utils
        param_schema = {
            "bounded_preemption_enabled": (bool, True),
            "ev_max_hold_steps": (int, 25),
            "relief_window_steps": (int, 8),
            "relief_min_opposite_halting": (int, 6),
            "starvation_debt_gain_per_step": (float, 1.0),
            "starvation_debt_decay_per_step": (float, 1.5),
            "starvation_debt_trigger": (float, 20.0),
            "ped_max_red_steps": (float, 75.0),
            "ped_guard_enabled": (bool, True),
            "min_speed_floor_mps": (float, 0.8),
            "max_eta_s": (float, 120.0),
            "max_detection_distance_m": (float, 180.0),
            "stale_sample_steps": (int, 12),
            "stale_distance_epsilon_m": (float, 0.75),
            "stale_speed_floor_mps": (float, 0.2),
            "stale_reject_cooldown_steps": (int, 20),
            "ev_reacquire_cooldown_steps": (int, 3),
            "layer_handoff_cooldown_steps": (int, 6),
            "emergency_floor_eta_s": (float, 8.0),
            "emergency_floor_distance_m": (float, 20.0),
            "emergency_floor_wait_s": (float, 20.0),
            "detection_eta_threshold": (float, 20.0),
            "queue_flush_factor": (float, 5.0),
            "max_flush_dist": (float, 120.0),
            "ev_pressure_multiplier": (float, 2.0),
            "bus_detection_base": (float, 100.0),
            "bus_detection_queue_factor": (float, 10.0),
            "bus_detection_max": (float, 250.0),
            "bus_wait_cap": (float, 30.0),
            "fairness_logic": (dict, {}),
        }
        self.controller = None
        extracted_config = extract_config_params(self.policy_config, param_schema)
        
        # Apply extracted parameters
        self.bounded_preemption_enabled = extracted_config["bounded_preemption_enabled"]
        self.ev_max_hold_steps = extracted_config["ev_max_hold_steps"]
        self.relief_window_steps = extracted_config["relief_window_steps"]
        self.relief_min_opposite_halting = extracted_config["relief_min_opposite_halting"]
        self.starvation_debt_gain_per_step = extracted_config["starvation_debt_gain_per_step"]
        self.starvation_debt_decay_per_step = extracted_config["starvation_debt_decay_per_step"]
        self.starvation_debt_trigger = extracted_config["starvation_debt_trigger"]
        self.ped_max_red_steps = extracted_config["ped_max_red_steps"]
        self.ped_guard_enabled = extracted_config["ped_guard_enabled"]
        self.min_speed_floor_mps = extracted_config["min_speed_floor_mps"]
        self.max_eta_s = extracted_config["max_eta_s"]
        self.max_detection_distance_m = extracted_config["max_detection_distance_m"]
        self.stale_sample_steps = extracted_config["stale_sample_steps"]
        self.stale_distance_epsilon_m = extracted_config["stale_distance_epsilon_m"]
        self.stale_speed_floor_mps = extracted_config["stale_speed_floor_mps"]
        self.stale_reject_cooldown_steps = extracted_config["stale_reject_cooldown_steps"]
        self.ev_reacquire_cooldown_steps = extracted_config["ev_reacquire_cooldown_steps"]
        self.layer_handoff_cooldown_steps = extracted_config["layer_handoff_cooldown_steps"]
        self.emergency_floor_eta_s = extracted_config["emergency_floor_eta_s"]
        self.emergency_floor_distance_m = extracted_config["emergency_floor_distance_m"]
        self.emergency_floor_wait_s = extracted_config["emergency_floor_wait_s"]
        self.detection_eta_threshold = extracted_config["detection_eta_threshold"]
        self.queue_flush_factor = extracted_config["queue_flush_factor"]
        self.max_flush_dist = extracted_config["max_flush_dist"]
        self.ev_pressure_multiplier = extracted_config["ev_pressure_multiplier"]
        self.bus_detection_base = extracted_config["bus_detection_base"]
        self.bus_detection_queue_factor = extracted_config["bus_detection_queue_factor"]
        self.bus_detection_max = extracted_config["bus_detection_max"]
        self.bus_wait_cap = extracted_config["bus_wait_cap"]
        self.fairness_cfg = extracted_config["fairness_logic"]
        
        # State tracking
        self.starvation_debt = {"NS": 0.0, "EW": 0.0}
        self.lock_acquired_step = None
        self.relief_active_until_step = -1
        self.relief_direction = None
        self.known_evs = set()
        self.previous_active_evs = set()
        self.previous_active_buses = set()

        # EV session + terminal-event guards
        self.ev_session_counter = 0
        self.ev_sessions = {}  
        self.ev_terminal_events = set() 
        self.ev_sample_state = {}
        self.soft_priority_state = "normal"
        self.soft_last_winner = None
        self.soft_winner_streak = 0
        self.recovery_end_time = 0
        self.recovery_direction = None
        self.bus_stats = {}
        self.pt_log = os.path.join(os.path.dirname(logger.log_path), "pt_log.txt")
        self.emergency_log = os.path.join(os.path.dirname(self.logger.log_path), "emergency_log.txt")
        self.ev_last_terminal_step = {}
        self.ev_stats = {}
        
        self.last_arbitration_layer = None
        self.layer_last_switch_step = -10**9

    def set_controller(self, controller):
        self.controller = controller

        # Soft-priority state
        self.soft_priority_state = "normal"
        self.soft_stress_on_streak = 0
        self.soft_stress_off_streak = 0
        self.soft_last_state_update_step = -10**9
        self.soft_last_winner = None
        self.soft_winner_streak = 0

    @staticmethod
    def _iter_existing_incoming_lanes(edges):
        try:
            lane_ids = traci.lane.getIDList()
        except Exception:
            return []

        edge_set = set(edges)
        return [
            lane_id
            for lane_id in lane_ids
            if ":" not in lane_id and lane_id.rsplit("_", 1)[0] in edge_set
        ]

    def _compute_ev_urgency_factor(self, wait_s, eta_s):
        cfg = self.soft_priority_config
        wait_thr = max(0.1, float(cfg.get("emergency_wait_urgent_s", 15.0)))
        eta_thr = max(0.1, float(cfg.get("emergency_eta_urgent_s", 10.0)))
        wait_cap = max(wait_thr + 1.0, float(cfg.get("emergency_wait_cap_s", 45.0)))
        eta_floor = max(0.1, float(cfg.get("emergency_eta_floor_s", 2.0)))

        if wait_s <= wait_thr and eta_s >= eta_thr:
            return 0.0

        wait_pressure = 0.0
        if wait_s > wait_thr:
            wait_pressure = min(1.0, (wait_s - wait_thr) / (wait_cap - wait_thr))

        eta_pressure = 0.0
        if eta_s < eta_thr:
            denom = max(eta_thr - eta_floor, 0.1)
            eta_pressure = min(1.0, max(0.0, (eta_thr - eta_s) / denom))

        return max(wait_pressure, eta_pressure)

    def _update_soft_priority_state(self, step, max_ped_wait):
        cfg = self.soft_priority_config
        update_every = max(1, int(cfg.get("hysteresis_update_steps", 8)))
        persist_cycles = max(1, int(cfg.get("hysteresis_persist_cycles", 2)))
        if step - self.soft_last_state_update_step < update_every:
            return

        debt_threshold = float(cfg.get("stress_debt_threshold", 20.0))
        ped_threshold = float(cfg.get("stress_ped_wait_threshold_s", 50.0))
        max_debt = max(self.starvation_debt.values()) if self.starvation_debt else 0.0
        stress_now = max_ped_wait >= ped_threshold or max_debt >= debt_threshold

        if stress_now:
            self.soft_stress_on_streak += 1
            self.soft_stress_off_streak = 0
        else:
            self.soft_stress_off_streak += 1
            self.soft_stress_on_streak = 0

        if self.soft_priority_state != "stressed" and self.soft_stress_on_streak >= persist_cycles:
            self.soft_priority_state = "stressed"
        elif self.soft_priority_state != "normal" and self.soft_stress_off_streak >= persist_cycles:
            self.soft_priority_state = "normal"

        self.soft_last_state_update_step = step

    @staticmethod
    def _opposite_direction(direction):
        return "EW" if direction == "NS" else "NS"

    def _sanitize_detection_sample(self, step, ev_id, lane_len, lane_pos, speed):
        dist_raw = max(0.0, lane_len - lane_pos)
        speed_floor = max(self.min_speed_floor_mps, 0.1)
        speed_eff = max(speed, speed_floor)

        dist = min(dist_raw, max(self.max_detection_distance_m, 1.0))
        eta = min(dist / speed_eff, max(self.max_eta_s, 1.0))

        stale = False
        state = self.ev_sample_state.get(ev_id)
        if state is not None:
            same_dist = abs(dist - state["dist"]) <= self.stale_distance_epsilon_m
            low_speed = speed <= self.stale_speed_floor_mps and state["speed"] <= self.stale_speed_floor_mps
            age = step - state["step"]
            if same_dist and low_speed and age <= self.stale_sample_steps:
                if (step - state.get("last_reject_step", -10**9)) >= self.stale_reject_cooldown_steps:
                    stale = True
                    state["last_reject_step"] = step

        self.ev_sample_state[ev_id] = {
            "step": step,
            "dist": dist,
            "speed": speed,
            "eta": eta,
            "last_reject_step": self.ev_sample_state.get(ev_id, {}).get("last_reject_step", -10**9),
        }
        return dist, eta, stale

    def _ensure_ev_session(self, step, ev_id, direction):
        session = self.ev_sessions.get(ev_id)
        if session and session.get("active", False):
            session["last_seen_step"] = step
            session["direction"] = direction
            return session, False

        self.ev_session_counter += 1
        session = {
            "id": self.ev_session_counter,
            "active": True,
            "direction": direction,
            "first_seen_step": step,
            "last_seen_step": step,
        }
        self.ev_sessions[ev_id] = session
        return session, True

    def _mark_session_terminal(self, step, ev_id, reason):
        session = self.ev_sessions.get(ev_id)
        if not session:
            return
        token = (ev_id, session["id"])
        if token in self.ev_terminal_events:
            return

        self.ev_terminal_events.add(token)
        session["active"] = False
        self.ev_last_terminal_step[ev_id] = step
        self.logger.log_event(
            step,
            getattr(self.logger, "mode", "SYSTEM"),
            self.ev_preemption_enabled,
            "PREEMPT_END",
            "ALL",
            f"EV {ev_id} cleared. session={session['id']} | {reason}",
        )

    def _select_arbitration_layer(self, step, has_emergency, should_fairness_relief):
        target = "adaptive_demand"
        if has_emergency:
            target = "emergency_safety"
        elif should_fairness_relief:
            target = "fairness_debt"

        if self.last_arbitration_layer is None:
            self.last_arbitration_layer = target
            self.layer_last_switch_step = step
            self.logger.log_event(
                step,
                getattr(self.logger, "mode", "SYSTEM"),
                self.ev_preemption_enabled,
                "PREEMPT_LAYER_SWITCH",
                "SYSTEM",
                f"layer={target}",
            )
            return target

        if target == self.last_arbitration_layer:
            return target

        rank = {"emergency_safety": 3, "fairness_debt": 2, "adaptive_demand": 1}
        if rank[target] > rank[self.last_arbitration_layer]:
            prev = self.last_arbitration_layer
            self.last_arbitration_layer = target
            self.layer_last_switch_step = step
            self.logger.log_event(
                step,
                getattr(self.logger, "mode", "SYSTEM"),
                self.ev_preemption_enabled,
                "PREEMPT_LAYER_SWITCH",
                "SYSTEM",
                f"{prev} -> {target} (priority override)",
            )
            return target

        if (step - self.layer_last_switch_step) >= self.layer_handoff_cooldown_steps:
            prev = self.last_arbitration_layer
            self.last_arbitration_layer = target
            self.layer_last_switch_step = step
            self.logger.log_event(
                step,
                getattr(self.logger, "mode", "SYSTEM"),
                self.ev_preemption_enabled,
                "PREEMPT_LAYER_SWITCH",
                "SYSTEM",
                f"{prev} -> {target} (cooldown={self.layer_handoff_cooldown_steps})",
            )

        return self.last_arbitration_layer

    def _is_adaptive_mode(self):
        mode = str(getattr(self.logger, "mode", ""))
        return "adaptive" in mode

    def _get_max_ped_wait(self):
        if not self.ped_guard_enabled:
            return 0.0
        try:
            person_ids = traci.person.getIDList()
            if not person_ids:
                return 0.0
            max_wait = 0.0
            for pid in person_ids:
                wait = traci.person.getWaitingTime(pid)
                if wait > max_wait:
                    max_wait = wait
            return max_wait
        except Exception:
            return 0.0

    # =========================================================================
    # MODEL 1: SOFT PRIORITY SYSTEM (Adaptive Mode Only)
    # Artificially inflates waiting times to give Buses and EVs
    # a mathematical advantage when calculating phase switches.
    # =========================================================================
    def get_composite_weights(self, ns_wait, ew_wait, ns_lanes, ew_lanes, use_priority=True):
      
        ns_bonus, ew_bonus = 0.0, 0.0
        if use_priority:
            current_step = int(traci.simulation.getTime())
            max_ped_wait = self._get_max_ped_wait()
            self._update_soft_priority_state(current_step, max_ped_wait)

            cfg = self.soft_priority_config
            bus_weight = float(cfg.get("bus_weight_normal", 12.0))
            if self.soft_priority_state == "stressed":
                bus_weight = float(cfg.get("bus_weight_stress", 10.0))

            ped_guard_threshold = float(cfg.get("ped_guard_threshold_s", 50.0))
            ped_guard_active = max_ped_wait >= ped_guard_threshold
            ped_guard_suppression = float(cfg.get("ped_guard_suppression", 0.35))
            emergency_base_weight = float(cfg.get("emergency_base_weight", 200.0))
            emergency_urgent_weight = float(cfg.get("emergency_urgent_weight", 320.0))
            emergency_wait_gain = float(cfg.get("emergency_wait_gain", 0.8))
            emergency_wait_cap = float(cfg.get("emergency_wait_cap_s", 45.0))
            bus_wait_gain = float(cfg.get("bus_wait_gain", 0.35))

            def calc_direction_bonus(lanes):
                bonus = 0.0
                for lane_id in lanes:
                    try:
                        lane_len = traci.lane.getLength(lane_id)
                        for vehicle_id in traci.lane.getLastStepVehicleIDs(lane_id):
                            v_type = traci.vehicle.getTypeID(vehicle_id)
                            v_class = traci.vehicle.getVehicleClass(vehicle_id)
                            
                            is_ev = (v_type == "emergency" or v_class == "emergency")
                            is_bus = (v_type == "bus" or v_class == "bus")

                            if not (is_ev or is_bus):
                                continue

                            wait_s = traci.vehicle.getWaitingTime(vehicle_id)
                            wait_capped = min(wait_s, emergency_wait_cap)

                            if is_ev:
                                lane_pos = traci.vehicle.getLanePosition(vehicle_id)
                                dist = max(0.0, lane_len - lane_pos)
                                speed = max(traci.vehicle.getSpeed(vehicle_id), 0.1)
                                eta_s = dist / speed
                                urgency = self._compute_ev_urgency_factor(wait_s, eta_s)
                                effective_urgent = emergency_urgent_weight * urgency
                                if ped_guard_active:
                                    effective_urgent *= ped_guard_suppression

                                b = emergency_base_weight + effective_urgent + (emergency_wait_gain * wait_capped)
                                bonus += b
                            else:
                                effective_bus_weight = bus_weight
                                if ped_guard_active:
                                    effective_bus_weight *= ped_guard_suppression
                                b = effective_bus_weight + (bus_wait_gain * min(wait_s, self.bus_wait_cap))
                                bonus += b
                    except Exception:
                        pass
                return bonus

            ns_bonus = calc_direction_bonus(ns_lanes)
            ew_bonus = calc_direction_bonus(ew_lanes)

            ns_priority_raw = ns_bonus
            ew_priority_raw = ew_bonus

            current_dir = self.controller.get_current_direction() if self.controller else "NS"
            base_green_bonus = float(cfg.get("base_green_bonus", 150.0))
            if current_dir == "NS":
                ns_bonus += base_green_bonus
            elif current_dir == "EW":
                ew_bonus += base_green_bonus

            bonus_cap = max(0.0, float(cfg.get("direction_bonus_cap", 500.0)))
            ns_bonus = min(ns_bonus, bonus_cap)
            ew_bonus = min(ew_bonus, bonus_cap)


            ns_weighted = max(0.0, ns_wait + ns_bonus)
            ew_weighted = max(0.0, ew_wait + ew_bonus)

            # Directional fairness: apply a temporary penalty if one corridor keeps winning.
            winner = None
            if ns_weighted > ew_weighted:
                winner = "NS"
            elif ew_weighted > ns_weighted:
                winner = "EW"

            if winner and winner == self.soft_last_winner:
                self.soft_winner_streak += 1
            elif winner:
                self.soft_winner_streak = 1
                self.soft_last_winner = winner

            fairness_trigger = max(1, int(cfg.get("fairness_streak_trigger", 3)))
            if winner and self.soft_winner_streak >= fairness_trigger:
                penalty = max(0.0, float(cfg.get("fairness_penalty", 140.0)))
                opposite_boost = max(0.0, float(cfg.get("fairness_opposite_boost", 60.0)))
                if winner == "NS":
                    ns_weighted = max(0.0, ns_weighted - penalty)
                    ew_weighted += opposite_boost
                else:
                    ew_weighted = max(0.0, ew_weighted - penalty)
                    ns_weighted += opposite_boost

            ns_bonus = max(0.0, ns_weighted - ns_wait)
            ew_bonus = max(0.0, ew_weighted - ew_wait)
        else:
            ns_priority_raw, ew_priority_raw = 0.0, 0.0
                    
        # EXPLICIT RECOVERY PHASE: Ensure starved direction gets and holds the green light
        current_time = traci.simulation.getTime()
        if current_time < self.recovery_end_time:
            if self.recovery_direction == "NS":
                ns_bonus += self.recovery_bonus
                ew_bonus -= ew_wait
            elif self.recovery_direction == "EW":
                ew_bonus += self.recovery_bonus
                ns_bonus -= ns_wait
                
        return max(0, ns_wait + ns_bonus), max(0, ew_wait + ew_bonus), ns_priority_raw, ew_priority_raw

    def track_emergencies(self, step):
        # Track EV stats for emergency_log.txt
        passed_evs = []
        try:
            for v in traci.vehicle.getIDList():
                if traci.vehicle.getTypeID(v) == "emergency":
                    if v not in self.ev_stats:
                        self.ev_stats[v] = {'waits': [], 'passed': False}
                    
                    wait = traci.vehicle.getWaitingTime(v)
                    self.ev_stats[v]['waits'].append(wait)
                    
                    edge = traci.vehicle.getRoadID(v)
                    if edge in ["C2N", "C2S", "C2E", "C2W"] and not self.ev_stats[v]['passed']:
                        self.ev_stats[v]['passed'] = True
                        passed_evs.append(v)
                        waits = self.ev_stats[v]['waits']
                        avg_wait = sum(waits) / len(waits) if waits else 0
                        max_wait = max(waits) if waits else 0
                        with open(self.emergency_log, "a") as f:
                            mode_name = getattr(self.logger, "mode", "unknown")
                            preempt_status = "with_preempt" if self.ev_preemption_enabled else "no_preempt"
                            f.write(f"[Step {step}] [{mode_name}_{preempt_status}] 🚨 (EV {v}) passed intersection. Avg Wait: {avg_wait:.2f}s, Max Wait: {max_wait:.2f}s\n")
        except:
            pass

        # Track the number of active EVs
        current_active_evs_set = set()
        for lane in self._iter_existing_incoming_lanes(["N2C", "S2C", "E2C", "W2C"]):
            try:
                for v in traci.lane.getLastStepVehicleIDs(lane):
                    if traci.vehicle.getTypeID(v) == "emergency":
                        dist = traci.lane.getLength(lane) - traci.vehicle.getLanePosition(v)
                        speed = max(traci.vehicle.getSpeed(v), 0.1)
                        eta = dist / speed
                        queue_length = traci.lane.getLastStepHaltingNumber(lane)
                        dynamic_dist = min(100 + (queue_length * 10), 250)
                        if dist < dynamic_dist or eta < self.detection_eta_threshold:
                            current_active_evs_set.add(v)
            except Exception:
                pass
                
        newly_active_evs = current_active_evs_set - self.previous_active_evs
        if newly_active_evs:
            with open(self.emergency_log, "a") as f:
                mode_name = getattr(self.logger, "mode", "unknown")
                preempt_status = "with_preempt" if self.ev_preemption_enabled else "no_preempt"
                ev_ids = ",".join(list(current_active_evs_set))
                f.write(f"[Step {step}] [{mode_name}_{preempt_status}] 🚨 (EV {ev_ids}) detected.\n")
                    
        self.previous_active_evs = current_active_evs_set
        return passed_evs

    def get_emergency_stats(self):

        if not self.ev_stats:
            return 0.0, 0.0, 0.0, []
        
        all_vehicle_max_waits = []
        for v_id in self.ev_stats:
            waits = self.ev_stats[v_id].get('waits', [])
            if waits:
                all_vehicle_max_waits.append(max(waits))
        
        if not all_vehicle_max_waits:
            return 0.0, 0.0, 0.0, []
            
        avg_wait = sum(all_vehicle_max_waits) / len(all_vehicle_max_waits)
        max_wait = max(all_vehicle_max_waits)
        total_wait = sum(all_vehicle_max_waits)
        return avg_wait, max_wait, total_wait, all_vehicle_max_waits

    def track_buses(self, step):
        # Track bus stats for pt_log.txt
        passed_buses = []
        try:
            for v in traci.vehicle.getIDList():
                if traci.vehicle.getTypeID(v) == "bus":
                    if v not in self.bus_stats:
                        self.bus_stats[v] = {'waits': [], 'passed': False}
                    
                    wait = traci.vehicle.getWaitingTime(v)
                    self.bus_stats[v]['waits'].append(wait)
                    
                    edge = traci.vehicle.getRoadID(v)
                    if edge in ["C2N", "C2S", "C2E", "C2W"] and not self.bus_stats[v]['passed']:
                        self.bus_stats[v]['passed'] = True
                        passed_buses.append(v)
                        waits = self.bus_stats[v]['waits']
                        avg_wait = sum(waits) / len(waits) if waits else 0
                        max_wait = max(waits) if waits else 0
                        with open(self.pt_log, "a") as f:
                            mode_name = getattr(self.logger, "mode", "unknown")
                            preempt_status = "with_preempt" if self.ev_preemption_enabled else "no_preempt"
                            f.write(f"[Step {step}] [{mode_name}_{preempt_status}] 🚌 (bus {v}) passed intersection. Avg Wait: {avg_wait:.2f}s, Max Wait: {max_wait:.2f}s\n")
        except:
            pass

        # Track the number of active buses
        current_active_buses_set = set()
        for lane in self._iter_existing_incoming_lanes(["N2C", "S2C", "E2C", "W2C"]):
            try:
                for v in traci.lane.getLastStepVehicleIDs(lane):
                    if traci.vehicle.getTypeID(v) == "bus":
                        dist = traci.lane.getLength(lane) - traci.vehicle.getLanePosition(v)
                        speed = max(traci.vehicle.getSpeed(v), 0.1)
                        eta = dist / speed
                        queue_length = traci.lane.getLastStepHaltingNumber(lane)
                        dynamic_dist = min(self.bus_detection_base + (queue_length * self.bus_detection_queue_factor), self.bus_detection_max)
                        if dist < dynamic_dist or eta < self.detection_eta_threshold:
                            current_active_buses_set.add(v)
            except Exception:
                pass
                
        newly_active_buses = current_active_buses_set - self.previous_active_buses
        if newly_active_buses:
            with open(self.pt_log, "a") as f:
                mode_name = getattr(self.logger, "mode", "unknown")
                preempt_status = "with_preempt" if self.ev_preemption_enabled else "no_preempt"
                bus_ids = ",".join(list(current_active_buses_set))
                f.write(f"[Step {step}] [{mode_name}_{preempt_status}] 🚌 (bus {bus_ids}) detected.\n")
                    
        self.previous_active_buses = current_active_buses_set
        return passed_buses

    # =========================================================================
    # MODEL 2: HARD EV PREEMPTION SYSTEM (Fixed & Adaptive Modes)
    # Physically hijacks the traffic light, forcing it green for approaching EVs 
    # and holding it until they safely pass through the intersection.
    # =========================================================================
    def get_bus_stats(self):
        if not self.bus_stats:
            return 0.0, 0.0, 0.0, []
        
        all_vehicle_max_waits = []
        for v_id in self.bus_stats:
            waits = self.bus_stats[v_id].get('waits', [])
            if waits:
                all_vehicle_max_waits.append(max(waits))
        
        if not all_vehicle_max_waits:
            return 0.0, 0.0, 0.0, []
            
        avg_wait = sum(all_vehicle_max_waits) / len(all_vehicle_max_waits)
        max_wait = max(all_vehicle_max_waits)
        total_wait = sum(all_vehicle_max_waits)
        return avg_wait, max_wait, total_wait, all_vehicle_max_waits

    def process_preemption(self, step, ns_is_g, ew_is_g, tl_setup=None):
        if not self.ev_preemption_enabled: return None

        active_evs = {"NS": [], "EW": []}
        force_advance = {"NS": False, "EW": False}
        corridor_halting = {"NS": 0, "EW": 0}

        lane_to_direction = {
            "N2C": "NS",
            "S2C": "NS",
            "E2C": "EW",
            "W2C": "EW",
        }
        for lane in self._iter_existing_incoming_lanes(["N2C", "S2C", "E2C", "W2C"]):
            edge = lane.rsplit("_", 1)[0]
            direction = lane_to_direction.get(edge, "NS")
            lane_queue_length = 0
            try:
                lane_queue_length = traci.lane.getLastStepHaltingNumber(lane)
            except Exception:
                lane_queue_length = 0
            corridor_halting[direction] += lane_queue_length

            try:
                for v in traci.lane.getLastStepVehicleIDs(lane):
                    if traci.vehicle.getTypeID(v) == "emergency":
                        dist = traci.lane.getLength(lane) - traci.vehicle.getLanePosition(v)
                        speed = traci.vehicle.getSpeed(v)
                        lane_len = traci.lane.getLength(lane)
                        lane_pos = traci.vehicle.getLanePosition(v)
                        dist, eta, stale_sample = self._sanitize_detection_sample(step, v, lane_len, lane_pos, speed)

                        if stale_sample:
                            self.logger.log_event(
                                step,
                                getattr(self.logger, "mode", "SYSTEM"),
                                self.ev_preemption_enabled,
                                "PREEMPT_STALE_SAMPLE",
                                direction,
                                f"Rejected stale EV sample id={v} dist={dist:.1f} eta={eta:.1f}",
                            )
                            continue
                            
                        # SMART PREEMPTION: Flush the queue!
                        # If there are civilian cars in front of the EV, trigger earlier to clear them out of the way
                        queue_length = lane_queue_length
                        # Keep the look-ahead conservative so we do not starve the opposite approach too early.
                        dynamic_dist = min(50 + (queue_length * self.queue_flush_factor), self.max_flush_dist)
                        
                        if dist < dynamic_dist or (dist < self.max_flush_dist and eta < self.detection_eta_threshold):
                            if (step - self.ev_last_terminal_step.get(v, -10**9)) < self.ev_reacquire_cooldown_steps:
                                continue

                            active_evs[direction].append((v, dist, max(speed, self.min_speed_floor_mps), traci.vehicle.getWaitingTime(v)))
                            session, is_new_session = self._ensure_ev_session(step, v, direction)
                            self.known_evs.add(v)
                            if is_new_session:
                                self.logger.log_emergency_lifecycle(
                                    step,
                                    "DETECTED",
                                    v,
                                    direction,
                                    f"session={session['id']} | dist={dist:.1f}m, eta={eta:.1f}s",
                                )
                                
                            # Check if the EV is physically stuck because its SPECIFIC route light is red
                            if dist < 20 and speed < 0.5 and tl_setup:
                                try:
                                    route = traci.vehicle.getRoute(v)
                                    curr_edge = traci.vehicle.getRoadID(v)
                                    curr_idx = route.index(curr_edge)
                                    if curr_idx + 1 < len(route):
                                        next_edge = route[curr_idx + 1]
                                        state = tl_setup.get_state()
                                        lane_is_green = False
                                        for idx, link_group in enumerate(tl_setup.links):
                                            if link_group and link_group[0][0] == lane:
                                                to_lane = link_group[0][1]
                                                to_edge = to_lane.rsplit('_', 1)[0]
                                                if to_edge == next_edge:
                                                    if state[idx].lower() == 'g':
                                                        lane_is_green = True
                                                        break
                                        if not lane_is_green:
                                            force_advance[direction] = True
                                except Exception:
                                    pass
            except Exception:
                pass
            
        target_direction = None
        locked_ev = None
        is_force_advance = False
        dynamic_streak_cap = self.dynamic_max_consecutive_same_direction

        active_ev_ids = set()

        def get_active_ev(ev_id):
            for direction, vehicles in active_evs.items():
                for candidate in vehicles:
                    if candidate[0] == ev_id:
                        return direction, candidate
            return None, None

        def compute_dynamic_streak_cap():
            # No fairness contention if only one corridor has active EVs.
            if not (active_evs["NS"] and active_evs["EW"]):
                return self.max_consecutive_same_direction

            ns_count = len(active_evs["NS"])
            ew_count = len(active_evs["EW"])
            ns_max_wait = max(ev[3] for ev in active_evs["NS"]) if ns_count else 0.0
            ew_max_wait = max(ev[3] for ev in active_evs["EW"]) if ew_count else 0.0

            ns_pressure = (ns_count * self.ev_pressure_multiplier) + corridor_halting["NS"]
            ew_pressure = (ew_count * self.ev_pressure_multiplier) + corridor_halting["EW"]
            pressure_ratio = (max(ns_pressure, ew_pressure) + 1.0) / (min(ns_pressure, ew_pressure) + 1.0)
            if self.enable_pressure_ratio_smoothing:
                self.pressure_ratio_history.append(pressure_ratio)
                pressure_ratio_smoothed = sum(self.pressure_ratio_history) / len(self.pressure_ratio_history)
            else:
                pressure_ratio_smoothed = pressure_ratio
            min_wait = min(ns_max_wait, ew_max_wait)
            wait_gap = abs(ns_max_wait - ew_max_wait)

            cap = 2
            
            f_cfg = self.fairness_cfg
            m_tighten = f_cfg.get("min_wait_tighten", 25)
            w_tighten = f_cfg.get("wait_gap_tighten", 8)
            r1_ratio = f_cfg.get("pressure_ratio_relax_1", 1.8)
            r1_wait = f_cfg.get("min_wait_relax_1", 20)
            r2_ratio = f_cfg.get("pressure_ratio_relax_2", 2.5)
            r2_wait = f_cfg.get("min_wait_relax_2", 12)

            # Tighten fairness when both directions are similarly urgent or both have long waits.
            if min_wait >= m_tighten or wait_gap <= w_tighten:
                cap = 1

            # Relax fairness when one corridor is clearly dominant and opposite waits are still low.
            if pressure_ratio_smoothed >= r1_ratio and min_wait < r1_wait:
                cap = 3
            if pressure_ratio_smoothed >= r2_ratio and min_wait < r2_wait:
                cap = 4

            cap = max(1, min(cap, 4))
            current_cap = self.dynamic_max_consecutive_same_direction
            if cap == current_cap:
                return cap

            if (step - self.dynamic_tune_last_change_step) < self.dynamic_tune_cooldown_steps:
                return current_cap

            move_dir = 1 if cap > current_cap else -1

            h_base = f_cfg.get("hysteresis_base", 1.95)
            h_step = f_cfg.get("hysteresis_step", 0.2)
            m_hyst_tight = f_cfg.get("min_wait_hyst_tighten", 28)
            w_hyst_tight = f_cfg.get("wait_gap_hyst_tighten", 6)

            if move_dir > 0:
                required_ratio = h_base + (h_step * (cap - current_cap))
                if pressure_ratio_smoothed < required_ratio:
                    return current_cap
            else:
                if not (min_wait >= m_hyst_tight or wait_gap <= w_hyst_tight):
                    return current_cap

            # Harder to change back immediately after a previous move in the opposite direction.
            r_ratio = f_cfg.get("pressure_ratio_rev_relax", 2.25)
            r_wait = f_cfg.get("min_wait_rev_relax", 16)
            m_wait_rev_tight = f_cfg.get("min_wait_rev_tighten", 32)
            w_gap_rev_tight = f_cfg.get("wait_gap_rev_tighten", 4)

            if (
                self.dynamic_tune_last_direction != 0
                and move_dir != self.dynamic_tune_last_direction
                and (step - self.dynamic_tune_last_change_step) < self.dynamic_tune_reverse_guard_steps
            ):
                if move_dir > 0:
                    if not (pressure_ratio_smoothed >= r_ratio and min_wait < r_wait):
                        return current_cap
                else:
                    if not (min_wait >= m_wait_rev_tight or wait_gap <= w_gap_rev_tight):
                        return current_cap

            return cap

        dynamic_streak_cap = compute_dynamic_streak_cap()
        if dynamic_streak_cap != self.dynamic_max_consecutive_same_direction:
            move_dir = 1 if dynamic_streak_cap > self.dynamic_max_consecutive_same_direction else -1
            self.dynamic_max_consecutive_same_direction = dynamic_streak_cap
            self.dynamic_tune_last_change_step = step
            self.dynamic_tune_last_direction = move_dir
            self.logger.log_event(
                step,
                getattr(self.logger, "mode", "SYSTEM"),
                self.ev_preemption_enabled,
                "PREEMPT_TUNE",
                "SYSTEM",
                f"Dynamic fairness cap set to {dynamic_streak_cap} (NS pressure={corridor_halting['NS']}, EW pressure={corridor_halting['EW']}, cooldown={self.dynamic_tune_cooldown_steps})",
            )

        def select_single_ev_lock():
            candidates = []
            for direction, vehicles in active_evs.items():
                for candidate in vehicles:
                    candidates.append((direction, candidate))
            if not candidates:
                return None, None

            ns_candidates = [c for c in candidates if c[0] == "NS"]
            ew_candidates = [c for c in candidates if c[0] == "EW"]

            def fifo_key(item):
                ev_id = item[1][0]
                return (
                    self.ev_lock_queue.get(ev_id, {}).get("first_seen_step", step),
                    str(ev_id),
                )

            # Fairness guard: if one corridor has been served too many times in a row,
            # and the other corridor has queued EVs, force handoff to the other side.
            if ns_candidates and ew_candidates and self.last_served_direction:
                if self.consecutive_same_direction >= dynamic_streak_cap:
                    forced_direction = "EW" if self.last_served_direction == "NS" else "NS"
                    forced_pool = ew_candidates if forced_direction == "EW" else ns_candidates
                    if forced_pool:
                        return min(forced_pool, key=fifo_key)

            return min(candidates, key=fifo_key)

        for direction, vehicles in active_evs.items():
            for candidate in vehicles:
                ev_id, dist, speed, wait = candidate
                active_ev_ids.add(ev_id)
                if ev_id not in self.ev_lock_queue:
                    self.ev_lock_queue[ev_id] = {
                        "first_seen_step": step,
                        "direction": direction,
                        "dist": dist,
                        "speed": speed,
                        "wait": wait,
                    }
                else:
                    self.ev_lock_queue[ev_id].update(
                        {
                            "direction": direction,
                            "dist": dist,
                            "speed": speed,
                            "wait": wait,
                        }
                    )

        for ev_id in list(self.ev_lock_queue.keys()):
            if ev_id not in active_ev_ids and ev_id != self.locked_ev_id:
                del self.ev_lock_queue[ev_id]

        def acquire_lock(direction, candidate):
            if direction == self.last_served_direction:
                self.consecutive_same_direction += 1
            else:
                self.consecutive_same_direction = 1
                self.last_served_direction = direction

            self.preempt_active = True
            self.preempt_direction = direction
            self.locked_ev_direction = direction
            self.locked_ev_id = candidate[0]
            self.lock_acquired_step = step
            return direction, candidate

        def release_lock(message):
            if self.locked_ev_id is not None:
                self._mark_session_terminal(step, self.locked_ev_id, message)
            self.preempt_active = False
            self.locked_ev_id = None
            self.locked_ev_direction = None
            self.preempt_direction = None
            self.lock_acquired_step = None

        if self.preempt_active:
            if self.locked_ev_id:
                locked_dir, locked_candidate = get_active_ev(self.locked_ev_id)
                if locked_candidate:
                    target_direction = locked_dir
                    locked_ev = locked_candidate
                    is_force_advance = force_advance[locked_dir]
                    self.preempt_direction = locked_dir
                    self.locked_ev_direction = locked_dir
                else:
                    # The locked EV is no longer in the approach lanes. Keep preemption only if it is still in the intersection.
                    ev_in_intersection = False
                    try:
                        for v in traci.vehicle.getIDList():
                            if v == self.locked_ev_id and traci.vehicle.getTypeID(v) == "emergency":
                                if "center" in traci.vehicle.getLaneID(v):
                                    ev_in_intersection = True
                                    return {"type": "hold_green"}
                    except Exception:
                        pass

                    if not ev_in_intersection:
                        release_lock("Releasing single-EV lock.")
                        target_direction, locked_ev = select_single_ev_lock()
                        if target_direction and locked_ev:
                            target_direction, locked_ev = acquire_lock(target_direction, locked_ev)
                            is_force_advance = force_advance[target_direction]
        else:
            target_direction, locked_ev = select_single_ev_lock()
            if target_direction and locked_ev:
                target_direction, locked_ev = acquire_lock(target_direction, locked_ev)
                is_force_advance = force_advance[target_direction]
                self.logger.log_emergency_lifecycle(
                    step,
                    "PREEMPT_ACTIVE",
                    self.locked_ev_id,
                    target_direction,
                    (
                        f"session={self.ev_sessions.get(self.locked_ev_id, {}).get('id', 'na')} | "
                        f"single-EV lock acquired (dist={locked_ev[1]:.1f}m, "
                        f"eta={locked_ev[1] / max(locked_ev[2], self.min_speed_floor_mps):.1f}s, wait={locked_ev[3]:.1f}s)"
                    ),
                )

        if target_direction:
            opposite_direction = self._opposite_direction(target_direction)
            opposite_halting = corridor_halting[opposite_direction]
            max_ped_wait = self._get_max_ped_wait()
            lock_eta = locked_ev[1] / max(locked_ev[2], self.min_speed_floor_mps) if locked_ev else 10**9
            emergency_floor_active = bool(
                is_force_advance
                or (locked_ev and locked_ev[1] <= self.emergency_floor_distance_m)
                or (lock_eta <= self.emergency_floor_eta_s)
                or (locked_ev and locked_ev[3] >= self.emergency_floor_wait_s)
            )

            # Update starvation debt: it grows for the side denied service while demand exists,
            # and decays for the side being currently served.
            if opposite_halting >= self.relief_min_opposite_halting:
                self.starvation_debt[opposite_direction] += self.starvation_debt_gain_per_step
            self.starvation_debt[target_direction] = max(
                0.0,
                self.starvation_debt[target_direction] - self.starvation_debt_decay_per_step,
            )

            hold_elapsed = (step - self.lock_acquired_step) if self.lock_acquired_step is not None else 0
            hold_limit_hit = hold_elapsed >= self.ev_max_hold_steps and opposite_halting >= self.relief_min_opposite_halting
            debt_limit_hit = self.starvation_debt[opposite_direction] >= self.starvation_debt_trigger
            ped_limit_hit = max_ped_wait >= self.ped_max_red_steps
            should_start_relief = self.bounded_preemption_enabled and (
                (hold_limit_hit or debt_limit_hit or ped_limit_hit)
                and opposite_halting >= self.relief_min_opposite_halting
            )

            if step > self.relief_active_until_step and self.relief_direction:
                self.logger.log_event(
                    step,
                    getattr(self.logger, "mode", "SYSTEM"),
                    self.ev_preemption_enabled,
                    "PREEMPT_RELIEF_END",
                    "SYSTEM",
                    f"Relief window ended for {self.relief_direction}",
                )
                self.relief_direction = None

            if should_start_relief and self.relief_window_steps > 0 and not self.relief_direction:
                self.relief_direction = opposite_direction
                self.relief_active_until_step = step + self.relief_window_steps
                self.starvation_debt[opposite_direction] = max(
                    0.0,
                    self.starvation_debt[opposite_direction] - self.starvation_debt_decay_per_step,
                )
                self.logger.log_event(
                    step,
                    getattr(self.logger, "mode", "SYSTEM"),
                    self.ev_preemption_enabled,
                    "PREEMPT_RELIEF_START",
                    "SYSTEM",
                    (
                        f"Relief to {opposite_direction} for {self.relief_window_steps} steps "
                        f"(hold_elapsed={hold_elapsed}, debt={self.starvation_debt[opposite_direction]:.1f}, max_ped_wait={max_ped_wait:.1f})"
                    ),
                )

            adaptive_layered_mode = self._is_adaptive_mode()
            layer = self._select_arbitration_layer(
                step,
                has_emergency=(emergency_floor_active if adaptive_layered_mode else True),
                should_fairness_relief=(self.relief_direction is not None and step <= self.relief_active_until_step),
            )

            # Hard precedence:
            # 1) emergency_safety (critical EV states only)
            # 2) fairness_debt (bounded relief for opposite corridor)
            # 3) adaptive_demand (fallback handoff in adaptive mode)
            if layer == "fairness_debt" and self.relief_direction:
                relief_dir = self.relief_direction
                if (relief_dir == "NS" and ns_is_g) or (relief_dir == "EW" and ew_is_g):
                    traci.trafficlight.setPhaseDuration("center", 4)
                    return {"type": "hold_green"}
                return {"type": "force_switch", "target_direction": relief_dir}

            if adaptive_layered_mode and layer == "adaptive_demand":
                return None

            if is_force_advance:
                return {"type": "force_switch", "target_direction": target_direction}

            # If target is already green, hold it (handled by apply_action)
            if (target_direction == "NS" and ns_is_g) or (target_direction == "EW" and ew_is_g):
                return {"type": "hold_green"}
            else:
                return {"type": "force_switch", "target_direction": target_direction}
        else:
            return None