import traci
from abc import ABC, abstractmethod
import math
from datetime import datetime, timedelta


class TrafficLightController(ABC):
    def __init__(self, lane_timings, logger):
        self.lane_timings = lane_timings
        self.logger = logger
        self.last_switch_step = 0
        self.metrics = {"threshold": 0.0, "ns_weight": 0.0, "ew_weight": 0.0}
        self.ns_phase = 0
        self.ew_phase = 2
        self.ped_phase = None

    @abstractmethod
    def get_adaptive_action(self, current_time, phase_tracker, ns_lanes, ew_lanes, use_priority=True, qdr_tracker=None, lane_data=None):
        pass

    def get_current_direction(self):
        try:
            current_phase = traci.trafficlight.getPhase("center")
            if current_phase == self.ns_phase: return "NS"
            if current_phase == self.ew_phase: return "EW"
        except:
            pass
        return "OTHER"

    def apply_action(self, action, strict_min_green=False, min_green_time=15, phase_tracker=None, current_time=None):
        """Forces a phase change or extends current phase. If strict_min_green is True, enforces minimum green time even for forced switches/preemption."""
        if action and action.get("type") == "force_switch":
            target = action.get("target_direction")
            if not target:
                current_phase = traci.trafficlight.getPhase("center")
                target = "EW" if current_phase == self.ns_phase else "NS"
                
            state = traci.trafficlight.getRedYellowGreenState("center")
            if 'y' in state.lower():
                return False
            current_phase = traci.trafficlight.getPhase("center")
            is_target = False
            if target == "NS" and current_phase == self.ns_phase: is_target = True
            elif target == "EW" and current_phase == self.ew_phase: is_target = True
            elif target == "PED" and self.ped_phase is not None and current_phase == self.ped_phase: is_target = True
            
            # Strict min green enforcement
            if strict_min_green and phase_tracker and current_time is not None:
                time_in_phase = phase_tracker.get_time_in_phase(current_time)
                if time_in_phase < min_green_time:
                    if int(current_time) % 5 == 0: # Avoid spamming
                        self.logger.log_event(int(current_time), self.logger.mode, self.logger.ev_preemption,
                                              "GUARDRAIL_BLOCK", target,
                                              f"Forced switch to {target} BLOCKED. Time in phase: {time_in_phase:.1f}s < Min: {min_green_time}s")
                    return False
            
            if not is_target:
                traci.trafficlight.setPhaseDuration("center", 0)
            else:
                if "duration" in action:
                    traci.trafficlight.setPhaseDuration("center", action["duration"])
            return True
        elif action and action.get("type") == "hold_green":
            # To hold, we set duration to something high to prevent automatic phase progression.
            # IMPORTANT: For Fixed mode, we must NOT use 999 or it will stall forever.
            duration = 999 if not isinstance(self, FixedTimeController) else 10
            traci.trafficlight.setPhaseDuration("center", duration)
            return True
        elif action and action.get("type") == "extend_phase":
            current_remaining = traci.trafficlight.getNextSwitch("center") - traci.simulation.getTime()
            extra_time = action.get("extra_time", 5)
            
            if "max_total_duration" in action and "time_in_phase" in action:
                max_total = action["max_total_duration"]
                time_in_phase = action["time_in_phase"]
                # Cap the extension to not exceed the maximum total duration
                if time_in_phase + current_remaining + extra_time > max_total:
                    extra_time = max(0, max_total - (time_in_phase + current_remaining))
                    
            new_duration = max(0, current_remaining + extra_time)
            traci.trafficlight.setPhaseDuration("center", new_duration)
            return True
        return False

class FixedTimeController(TrafficLightController):
    def get_adaptive_action(self, current_time, phase_tracker, ns_lanes, ew_lanes, use_priority=True, qdr_tracker=None, lane_data=None):
        return None

class AdaptiveController(TrafficLightController):
    def __init__(self, lane_timings, logger, integrator, dynamic_red_config=None, adaptive_config=None, start_datetime=None):
        super().__init__(lane_timings, logger)
        self.integrator = integrator
        self.start_datetime = start_datetime
        self.dynamic_red_config = dynamic_red_config or {}
        self.adaptive_config = adaptive_config or {}
        self.min_green_time = int(self.adaptive_config.get("min_green_time", 45))
        self.max_green_time = int(self.adaptive_config.get("max_green_time", 120))
        
        # --- Safety Bounds ---
        self.safety_min_green_floor = int(self.adaptive_config.get("safety_min_green_floor", 15))
        self.hard_max_green_ceiling = int(self.adaptive_config.get("hard_max_green_ceiling", 300))
        
        # --- Tunable Adaptive Hyperparameters ---
        self.no_preempt_policy = self.adaptive_config.get("no_preempt_policy", {})
        self.base_switch_cost = float(self.no_preempt_policy.get("base_switch_cost", 500.0))
        self.green_active_bonus = float(self.no_preempt_policy.get("green_active_bonus", 25.0))
        self.max_starvation_penalty = float(self.no_preempt_policy.get("max_starvation_penalty", 0.5))
        self.queue_tolerance = float(self.no_preempt_policy.get("queue_tolerance", 15.0))
        self.sigmoid_steepness = float(self.no_preempt_policy.get("sigmoid_steepness", -0.2))
        self.max_threshold_cap = float(self.no_preempt_policy.get("max_threshold_cap", 1000.0))
        self.zero_waste_multiplier = float(self.no_preempt_policy.get("zero_waste_multiplier", 0.3))
        self.weight_to_queue_factor = float(self.no_preempt_policy.get("weight_to_queue_factor", 100.0))
        
        self.use_volume_profiles = self.adaptive_config.get("use_volume_profiles", True)
        self.volume_profiles = self.adaptive_config.get("volume_profiles", {})
        self.high_traffic_volume_threshold = int(self.volume_profiles.get("high_traffic", {}).get("threshold", 50))
        self.low_traffic_volume_threshold = int(self.volume_profiles.get("low_traffic", {}).get("threshold", 15))
        
        self.rush_hour_cfg = self.adaptive_config.get("rush_hour_config", {})
        self.morning_rush_start_hour = int(self.rush_hour_cfg.get("morning_rush_start_hour", 7))
        self.morning_rush_end_hour = int(self.rush_hour_cfg.get("morning_rush_end_hour", 10))
        self.evening_rush_start_hour = int(self.rush_hour_cfg.get("evening_rush_start_hour", 16))
        self.evening_rush_end_hour = int(self.rush_hour_cfg.get("evening_rush_end_hour", 19))
        self.morning_rush_end_s = int(self.rush_hour_cfg.get("morning_rush_end_s", 1200))
        self.evening_rush_start_s = int(self.rush_hour_cfg.get("evening_rush_start_s", 2400))
        
        self.stretch_cfg = self.adaptive_config.get("stretch_logic", {})
        self.startup_stretch = float(self.stretch_cfg.get("startup_stretch", 5.0))
        self.startup_qdr_thr = float(self.stretch_cfg.get("startup_qdr_threshold", 0.8))
        self.weather_stretch = float(self.stretch_cfg.get("weather_stretch", 20.0))
        self.weather_qdr_thr = float(self.stretch_cfg.get("weather_qdr_threshold", 0.6))
        
        # Preemption Bypass
        self.enable_preemption_bypass = bool(self.adaptive_config.get("enable_preemption_bypass", False))
        self.preemption_min_green = int(self.adaptive_config.get("preemption_min_green", 5))
        
        self.incident_cfg = self.stretch_cfg.get("incident_detection", {})
        
        self.predictive_cfg = self.adaptive_config.get("predictive_logic", {})
        self.clearance_buffer = float(self.predictive_cfg.get("clearance_buffer", 5.0))
        self.post_perfect_threshold_mult = float(self.predictive_cfg.get("post_perfect_threshold_mult", 0.75))
        
        self.current_traffic_mode = "Normal"
        
        self.time_of_day_mode = "Init"
        self.ns_bias = 1.0  # Multiplier for NS threshold
        self.ew_bias = 1.0  # Multiplier for EW threshold
        self.priority_unit_cost = float(self.no_preempt_policy.get("priority_unit_cost", 100.0))

        # Stabilization logic
        self.switch_stabilization_s = int(self.volume_profiles.get("switch_stabilization_s", 10))
        self.candidate_mode = "Normal"
        self.candidate_mode_start_time = -1
 
    def calculate_sigmoid_threshold(self, green_lanes, red_weight, flow_efficiency=1.0, lane_data=None, red_priority_bonus=0.0):
        if lane_data is not None:
            green_active = sum([lane_data[l].get(traci.constants.LAST_STEP_VEHICLE_NUMBER, 0) for l in green_lanes if l in lane_data])
        else:
            green_active = sum([traci.lane.getLastStepVehicleNumber(l) for l in green_lanes])
        
        effective_bonus = self.green_active_bonus * min(1.5, flow_efficiency)
        base_threshold = self.base_switch_cost + (green_active * effective_bonus)
        
        base_threshold = min(base_threshold, self.max_threshold_cap)
        
        effective_red_q = red_weight / self.weight_to_queue_factor
        
        # Sigmoid curve
        sigmoid_factor = 1.0 - (self.max_starvation_penalty / (1 + math.exp(self.sigmoid_steepness * (effective_red_q - self.queue_tolerance))))
        
        # Priority vehicles on the RED side effectively reduce the barrier to switch.
        priority_scaling = 1.0 / (1.0 + (red_priority_bonus / self.priority_unit_cost))
        
        return base_threshold * sigmoid_factor * priority_scaling
 
    def update_dynamic_parameters(self, current_time, all_lanes):
        """
        Monitors total traffic volume at the intersection and adjusts 
        the controller's behavior profile dynamically.
        """
        if not self.use_volume_profiles:
            if self.current_traffic_mode != "Normal":
                 self.current_traffic_mode = "Normal"
                 self.base_switch_cost = float(self.no_preempt_policy.get("base_switch_cost", 50.0))
                 self.green_active_bonus = float(self.no_preempt_policy.get("green_active_bonus", 20.0))
                 self.max_starvation_penalty = float(self.no_preempt_policy.get("max_starvation_penalty", 0.5))
                 self.queue_tolerance = float(self.no_preempt_policy.get("queue_tolerance", 1.0))
            return

        total_volume = sum([traci.lane.getLastStepVehicleNumber(l) for l in all_lanes])
        
        if total_volume > self.high_traffic_volume_threshold:
            target_mode = "High Traffic"
        elif total_volume < self.low_traffic_volume_threshold:
            target_mode = "Low Traffic"
        else:
            target_mode = "Normal"

        if target_mode != self.current_traffic_mode:
            if target_mode != self.candidate_mode:
                self.candidate_mode = target_mode
                self.candidate_mode_start_time = current_time
            else:
                duration = current_time - self.candidate_mode_start_time
                if duration >= self.switch_stabilization_s:
                    old_mode = self.current_traffic_mode
                    self.current_traffic_mode = target_mode
                    self.logger.log_event(int(current_time), self.logger.mode, self.logger.ev_preemption,
                                          "ADAPTIVE_SWITCH", "SYSTEM",
                                          f"Traffic profile shifted from {old_mode} to {target_mode} after {int(duration)}s stability (Volume: {total_volume} cars)")
                    
                    self._apply_mode_hyperparameters(current_time)
        else:
            self.candidate_mode = self.current_traffic_mode
            self.candidate_mode_start_time = -1

    def _apply_mode_hyperparameters(self, current_time):
        base_cost = float(self.no_preempt_policy.get("base_switch_cost", 50.0))
        base_bonus = float(self.no_preempt_policy.get("green_active_bonus", 20.0))
        base_penalty = float(self.no_preempt_policy.get("max_starvation_penalty", 0.5))
        base_q_tol = float(self.no_preempt_policy.get("queue_tolerance", 16.0))
        base_weight_q = float(self.no_preempt_policy.get("weight_to_queue_factor", 100.0))
        base_zero_waste = float(self.no_preempt_policy.get("zero_waste_multiplier", 0.3))
        
        # Base green times for scaling
        base_min = int(self.adaptive_config.get("min_green_time", 45))
        base_max = int(self.adaptive_config.get("max_green_time", 120))

        if self.current_traffic_mode == "High Traffic":
            profile = self.volume_profiles.get("high_traffic", {})
            self.base_switch_cost = base_cost * float(profile.get("base_switch_cost_mult", 1.0))
            self.green_active_bonus = base_bonus * float(profile.get("green_active_bonus_mult", 1.0))
            self.max_starvation_penalty = base_penalty * float(profile.get("max_starvation_penalty_mult", 1.0))
            self.queue_tolerance = base_q_tol * float(profile.get("queue_tolerance_mult", 1.0))
            self.weight_to_queue_factor = base_weight_q * float(profile.get("weight_to_queue_factor_mult", 1.0))
            self.zero_waste_multiplier = base_zero_waste * float(profile.get("zero_waste_multiplier_mult", 1.0))
            
            # Scale cycle lengths with safety clamping
            scaled_min = int(base_min * float(profile.get("min_green_mult", 1.0)))
            scaled_max = int(base_max * float(profile.get("max_green_mult", 1.0)))
            self.min_green_time = max(self.safety_min_green_floor, scaled_min)
            self.max_green_time = min(self.hard_max_green_ceiling, scaled_max)

        elif self.current_traffic_mode == "Low Traffic":
            profile = self.volume_profiles.get("low_traffic", {})
            self.base_switch_cost = base_cost * float(profile.get("base_switch_cost_mult", 1.0))
            self.green_active_bonus = base_bonus * float(profile.get("green_active_bonus_mult", 1.0))
            self.max_starvation_penalty = base_penalty * float(profile.get("max_starvation_penalty_mult", 1.0))
            self.queue_tolerance = base_q_tol * float(profile.get("queue_tolerance_mult", 1.0))
            self.weight_to_queue_factor = base_weight_q * float(profile.get("weight_to_queue_factor_mult", 1.0))
            self.zero_waste_multiplier = base_zero_waste * float(profile.get("zero_waste_multiplier_mult", 1.0))
            
            scaled_min = int(base_min * float(profile.get("min_green_mult", 1.0)))
            scaled_max = int(base_max * float(profile.get("max_green_mult", 1.0)))
            self.min_green_time = max(self.safety_min_green_floor, scaled_min)
            self.max_green_time = min(self.hard_max_green_ceiling, scaled_max)

        else:
            # Restore default parameters
            self.base_switch_cost = base_cost
            self.green_active_bonus = base_bonus
            self.max_starvation_penalty = base_penalty
            self.queue_tolerance = base_q_tol
            self.weight_to_queue_factor = base_weight_q
            self.zero_waste_multiplier = base_zero_waste
            self.min_green_time = base_min
            self.max_green_time = base_max
                
        # --- Time of Day Logic ---
        new_tod_mode = "Standard"
        
        if self.start_datetime:
            # Use wall-clock time from real data if available
            current_dt = self.start_datetime + timedelta(seconds=current_time)
            hour = current_dt.hour
            if self.morning_rush_start_hour <= hour < self.morning_rush_end_hour:
                new_tod_mode = "Morning Rush (NS Priority)"
            elif self.evening_rush_start_hour <= hour < self.evening_rush_end_hour:
                new_tod_mode = "Evening Rush (EW Priority)"
        else:
            if current_time < self.morning_rush_end_s:
                new_tod_mode = "Morning Rush (NS Priority)"
            elif current_time > self.evening_rush_start_s:
                new_tod_mode = "Evening Rush (EW Priority)"
            
        if new_tod_mode != self.time_of_day_mode:
            self.time_of_day_mode = new_tod_mode
            self.logger.log_event(int(current_time), self.logger.mode, self.logger.ev_preemption,
                                  "ADAPTIVE_SWITCH", "SYSTEM",
                                  f"Time-of-Day shifted to {new_tod_mode}")
            if new_tod_mode == "Morning Rush (NS Priority)":
                self.ns_bias = float(self.rush_hour_cfg.get("ns_bias", 0.6))
                self.ew_bias = float(self.rush_hour_cfg.get("ew_bias", 1.4))
            elif new_tod_mode == "Evening Rush (EW Priority)":
                self.ns_bias = float(self.rush_hour_cfg.get("ew_bias", 1.4)) # Inverted logic for EW rush
                self.ew_bias = float(self.rush_hour_cfg.get("ns_bias", 0.6))
            else:
                self.ns_bias = 1.0
                self.ew_bias = 1.0

    def get_adaptive_action(self, current_time, phase_tracker, ns_lanes, ew_lanes, use_priority=True, qdr_tracker=None, lane_data=None):
        """
        Determines if the current green phase should end based on weighted demand.
        """
        if not phase_tracker.current_green_direction: 
            return None
            
        self.update_dynamic_parameters(current_time, ns_lanes + ew_lanes)
        
        time_in_phase = phase_tracker.get_time_in_phase(current_time)
        current_dir = phase_tracker.current_green_direction
        
        qdr_stats = qdr_tracker.get_stats(current_dir) if qdr_tracker else {"avg": 1.0, "recent": 1.0}
        avg_qdr = qdr_stats["avg"]
        recent_qdr = qdr_stats["recent"]
        
        dynamic_max_green = self.max_green_time + (self.weather_stretch if avg_qdr < self.weather_qdr_thr else 0)
        
        dynamic_min_green = self.min_green_time + (self.startup_stretch if avg_qdr < self.startup_qdr_thr else 0)
        
        min_incident_time = int(self.incident_cfg.get("min_time", 20))
        recent_qdr_thr = float(self.incident_cfg.get("recent_qdr_threshold", 0.15))
        avg_qdr_m = float(self.incident_cfg.get("avg_qdr_min", 0.5))
        
        if time_in_phase > min_incident_time and recent_qdr < recent_qdr_thr and avg_qdr > avg_qdr_m:
            self.logger.log_event(int(current_time), self.logger.mode, self.logger.ev_preemption,
                                  "INCIDENT_DETECTED", current_dir, "⚠️ BLOCKAGE! Very low QDR. Forcing switch.")
            self.last_switch_step = current_time
            target = "EW" if current_dir == "NS" else "NS"
            return {"type": "force_switch", "target_direction": target, "reason": "incident_blockage"}
        
        ns_weight, ew_weight, ns_bonus, ew_bonus = self.integrator.calculate_weighted_waits(ns_lanes, ew_lanes, use_priority, lane_data=lane_data)
        self.metrics["ns_weight"] = ns_weight
        self.metrics["ew_weight"] = ew_weight

        opposing_priority_waiting = (ew_bonus > 0) if current_dir == "NS" else (ns_bonus > 0)
        
        effective_min_green = dynamic_min_green
        if self.enable_preemption_bypass and opposing_priority_waiting:
            effective_min_green = max(self.preemption_min_green, 5) # Absolute safety floor of 5s for EVs
            
        if time_in_phase < effective_min_green: 
            return None
 
        if time_in_phase >= dynamic_max_green:
            self.last_switch_step = current_time
            target = "EW" if current_dir == "NS" else "NS"
            return {"type": "force_switch", "target_direction": target, "reason": "max_green"}
 
        start_q = qdr_tracker.active_qdr.get("start_queue", 0) if qdr_tracker and qdr_tracker.active_qdr["direction"] == current_dir else 0
        perfect_green_time = (start_q / max(avg_qdr, 0.2)) + self.clearance_buffer
        
        threshold_multiplier = self.post_perfect_threshold_mult if time_in_phase > perfect_green_time else 1.0
        
        # ZERO-WASTE OPTIMIZATION: If no queue and no active cars, drop threshold completely
        active_green_lanes = ns_lanes if current_dir == "NS" else ew_lanes
        if lane_data is not None:
            green_active = sum([lane_data[l].get(traci.constants.LAST_STEP_VEHICLE_NUMBER, 0) for l in active_green_lanes if l in lane_data])
        else:
            green_active = sum([traci.lane.getLastStepVehicleNumber(l) for l in active_green_lanes])
            
        # ZERO-WASTE OPTIMIZATION: If no queue and no active cars, drop threshold completely
        if active_green_lanes and start_q == 0 and green_active == 0:
            threshold_multiplier = self.zero_waste_multiplier
 
        # Switching Logic
        
        # Calculate Flow Efficiency: >1.0 means fast flow, <1.0 means thinning platoon
        flow_efficiency = recent_qdr / max(avg_qdr, 0.1)
        
        if current_dir == "NS":
            # When NS is green, EW is trying to interrupt. 
            # We pass the EW priority bonus to lower the NS threshold.
            actual_ew_bias = self.ew_bias if ew_lanes else 1.0
            current_threshold = self.calculate_sigmoid_threshold(ns_lanes, ew_weight, flow_efficiency, lane_data=lane_data, red_priority_bonus=ew_bonus) * actual_ew_bias * threshold_multiplier
            
            self.metrics["threshold"] = current_threshold
            
            # Log threshold and weights every 5 seconds
            if int(current_time) % 5 == 0:
                p_scaling = 1.0 / (1.0 + (ew_bonus / self.priority_unit_cost))
                self.logger.log_event(int(current_time), self.logger.mode, self.logger.ev_preemption,
                                      "THRESHOLD_TRACE", current_dir,
                                      f"Threshold: {current_threshold:.1f} (Scale: {p_scaling:.2f}, Bias: {actual_ew_bias:.2f}) | Net Demand EW: {ew_weight - ns_weight:.1f} | Demand EW: {ew_weight:.1f} | Demand NS: {ns_weight:.1f}")
                                      
            starvation_limit = 300.0 # Absolute pressure to force switch
            
            if ew_weight > starvation_limit or (ew_weight - 0.4 * ns_weight) > current_threshold:
                self.last_switch_step = current_time
                return {"type": "force_switch", "target_direction": "EW", "reason": "adaptive_demand"}
            else:
                return {"type": "hold_green"}
        elif current_dir == "EW":
            actual_ns_bias = self.ns_bias if ns_lanes else 1.0
            current_threshold = self.calculate_sigmoid_threshold(ew_lanes, ns_weight, flow_efficiency, lane_data=lane_data, red_priority_bonus=ns_bonus) * actual_ns_bias * threshold_multiplier
            
            self.metrics["threshold"] = current_threshold
            
            if int(current_time) % 5 == 0:
                p_scaling = 1.0 / (1.0 + (ns_bonus / self.priority_unit_cost))
                self.logger.log_event(int(current_time), self.logger.mode, self.logger.ev_preemption,
                                      "THRESHOLD_TRACE", current_dir,
                                      f"Threshold: {current_threshold:.1f} (Scale: {p_scaling:.2f}, Bias: {actual_ns_bias:.2f}) | Net Demand NS: {ns_weight - ew_weight:.1f} | Demand NS: {ns_weight:.1f} | Demand EW: {ew_weight:.1f}")
            
            starvation_limit = 300.0
            
            if ns_weight > starvation_limit or (ns_weight - 0.4 * ew_weight) > current_threshold:
                self.last_switch_step = current_time
                return {"type": "force_switch", "target_direction": "NS", "reason": "adaptive_demand"}
            else:
                return {"type": "hold_green"}
        
        elif current_dir == "PED":
            if ns_weight > ew_weight and ns_weight > 50.0: # Minimum threshold to interrupt peds
                 self.last_switch_step = current_time
                 return {"type": "force_switch", "target_direction": "NS", "reason": "ped_exit_demand"}
            elif ew_weight > ns_weight and ew_weight > 50.0:
                 self.last_switch_step = current_time
                 return {"type": "force_switch", "target_direction": "EW", "reason": "ped_exit_demand"}

        return None