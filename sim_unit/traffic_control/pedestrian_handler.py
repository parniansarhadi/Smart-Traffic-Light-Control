import traci

class PedestrianHandler:
    """Handles pedestrian detection and priority for adaptive control"""
    
    def __init__(self, logger, ped_mode="balanced", custom_weight=None, priority_threshold=5.0, max_ped_phase_duration=60, extension_per_ped=2.0, clearance_time=3.0, cooldown=0.0, base_duration=10.0):
        self.logger = logger
        self.ped_mode = ped_mode
        self.extension_per_ped = float(extension_per_ped)
        self.ped_cooldown_end = 0
        self.active_ped_count = 0
        self.max_ped_phase_duration = float(max_ped_phase_duration)
        self.clearance_time = 2.0
        self.cooldown = 0.0
        self.base_duration = 10.0
        self.total_time_saved = 0.0
        
        # Set priority weight based on chosen mode
        if custom_weight is not None:
            self.weight = float(custom_weight)
        elif self.ped_mode == "vehicle_first":
            self.weight = 0.0   # Pedestrians have zero impact on phase length
        elif self.ped_mode == "pedestrian_first":
            self.weight = 100.0 # Massive impact, guarantees pedestrians can interrupt platoons
        else:  # "balanced"
            self.weight = 50.0  # Moderate influence
            
        self.logger.log_event(0, "SYSTEM", False, "ADAPTIVE_SWITCH", "ALL", f"Pedestrian Mode Initialized: {self.ped_mode.upper()} (Weight: {self.weight})")
            
        self.priority_threshold = float(priority_threshold)  # Seconds to trigger pedestrian priority
    
    def get_pedestrian_waiting_time(self):
        """Get total weighted waiting time for all pedestrians"""
        ped_wait = sum([traci.person.getWaitingTime(p) for p in traci.person.getIDList()])
        return ped_wait * self.weight
    
    def get_pedestrian_count(self):
        """Get current number of pedestrians"""
        return len(traci.person.getIDList())
    
    def adjust_waiting_time(self, ns_wait, ew_wait, current_dir=None):
        """Add pedestrian waiting time to the opposing direction to trigger a switch"""
        if self.weight == 0:
            return ns_wait, ew_wait
        ped_wait = self.get_pedestrian_waiting_time()
        
        if current_dir == "NS":
            ew_wait += ped_wait
        elif current_dir == "EW":
            ns_wait += ped_wait
        else:
            ns_wait += ped_wait
            ew_wait += ped_wait
            
        return ns_wait, ew_wait

    def get_crossing_pedestrians(self):
        try:
            peds_in_intersection = 0
            for p in traci.person.getIDList():
                edge = traci.person.getRoadID(p)
                if "center" in edge or ":" in edge:
                    peds_in_intersection += 1
            return peds_in_intersection
        except: return 0

    def check_pedestrian_preemption(self, step, current_time, ns_lanes, ew_lanes, min_green_time_met=True, is_ped_phase=False, time_in_phase=0, use_priority=False):
        """Forces a switch to the PED phase or extends it if currently active"""
        # If vehicle priority is active, we bypass the aggressive force-switch logic entirely.
        # Pedestrians will only cross if a natural demand switch occurs.
        if self.weight == 0 or self.ped_mode == "vehicle_first":
            return None
            
        ped_ids = traci.person.getIDList()
        current_ped_count = len(ped_ids)

        # --- EXTENSION LOGIC ---
        if is_ped_phase:
            # --- SKIP / EARLY TERMINATION LOGIC ---
            # Check if there are actually any pedestrians waiting or actively crossing
            waiting_peds = [p for p in ped_ids if traci.person.getWaitingTime(p) > 0]
            peds_in_intersection = 0
            try:
                for p in ped_ids:
                    edge = traci.person.getRoadID(p)
                    if "center" in edge or ":" in edge:
                        peds_in_intersection += 1
            except: pass
            
            # If phase naturally started but no one is there, skip it to save time!
            if len(waiting_peds) == 0 and peds_in_intersection == 0:
                remaining_time = max(0, traci.trafficlight.getNextSwitch("center") - traci.simulation.getTime())
                
                if time_in_phase <= 1:
                    if remaining_time > 0:
                        self.total_time_saved += remaining_time
                        self.logger.log_event(step, getattr(self.logger, "mode", "SYSTEM"), getattr(self.logger, "ev_preemption", False), "PED_PREEMPT", "PED", f"Zero pedestrians waiting. Naturally skipping PED phase. (Saved: {remaining_time:.1f}s)")
                        self.active_ped_count = 0
                        return {"type": "force_switch", "target_direction": "NS"}
                else:
                    clearance_time = self.clearance_time
                    if remaining_time > clearance_time:
                        saved_time = remaining_time - clearance_time
                        self.total_time_saved += saved_time
                        self.logger.log_event(step, getattr(self.logger, "mode", "SYSTEM"), getattr(self.logger, "ev_preemption", False), "PED_PREEMPT", "PED", f"Pedestrians cleared intersection. Ending PED phase early with {int(clearance_time)}s clearance. (Saved: {saved_time:.1f}s)")
                        self.active_ped_count = 0
                        return {"type": "force_switch", "target_direction": "NS", "duration": clearance_time}

            # If there are more pedestrians now than we saw last step, extend!
            if current_ped_count > self.active_ped_count:
                new_arrivals = current_ped_count - self.active_ped_count
                extra_time = new_arrivals * self.extension_per_ped
                
                if time_in_phase >= self.max_ped_phase_duration:
                    self.logger.log_event(step, getattr(self.logger, "mode", "SYSTEM"), getattr(self.logger, "ev_preemption", False), "PED_PREEMPT", "PED", f"{new_arrivals} new pedestrians, but hard cap of {self.max_ped_phase_duration}s reached. Denying extension.")
                else:
                    self.logger.log_event(step, getattr(self.logger, "mode", "SYSTEM"), getattr(self.logger, "ev_preemption", False), "PED_PREEMPT", "PED", f"{new_arrivals} new pedestrians arrived. Requesting {extra_time}s extension.")
                    self.active_ped_count = current_ped_count
                    return {
                        "type": "extend_phase", 
                        "extra_time": extra_time, 
                        "max_total_duration": self.max_ped_phase_duration, 
                        "time_in_phase": time_in_phase
                    }
            self.active_ped_count = current_ped_count
            return None
        else:
            self.active_ped_count = current_ped_count

        # Don't interrupt if we recently had a PED phase
        if current_time < self.ped_cooldown_end:
            return None
            
        # If vehicle priority is active, bypass aggressive force-switch so AdaptiveController manages phase transitions naturally.
        if use_priority:
            return None
            
        if not ped_ids:
            return None
            
        max_wait = max([traci.person.getWaitingTime(p) for p in ped_ids])
        active_threshold = 10 if self.ped_mode == "pedestrian_first" else self.priority_threshold
        
        # Determine dynamic duration based on the number of waiting pedestrians
        ped_count = len(ped_ids)

        dynamic_duration = min(self.max_ped_phase_duration, max(self.base_duration, self.base_duration + int(ped_count * self.extension_per_ped)))

        # Check for zero vehicle demand on all approaches
        total_vehicles = sum(traci.lane.getLastStepVehicleNumber(l) for l in ns_lanes + ew_lanes)
        zero_demand_trigger = (total_vehicles == 0 and min_green_time_met)
        
        if (max_wait > active_threshold and min_green_time_met) or zero_demand_trigger:
            reason = "Zero vehicle demand" if zero_demand_trigger else f"Max wait ({max_wait:.1f}s) exceeded threshold"
            self.logger.log_event(step, getattr(self.logger, "mode", "SYSTEM"), getattr(self.logger, "ev_preemption", False), "PED_PREEMPT", "PED", f"{reason}. Requesting PED Phase (Duration: {dynamic_duration}s for {ped_count} peds).")
            return {"type": "force_switch", "target_direction": "PED", "duration": dynamic_duration}
            
        return None

    def confirm_ped_action(self, current_time, action):
        if action.get("type") == "force_switch" and action.get("target_direction") == "PED":
            duration = action.get("duration", self.base_duration)
            self.ped_cooldown_end = current_time + duration + self.cooldown
