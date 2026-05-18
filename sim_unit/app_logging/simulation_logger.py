class SimulationLogger:
    """Handles all simulation logging with persistent file handle to reduce I/O overhead."""
    
    def __init__(self, log_path, mode, ev_preemption):
        self.log_path = log_path
        self.mode = mode
        self.ev_preemption = ev_preemption
        self.file_handle = open(self.log_path, "w")
        self.file_handle.write(f"Simulation Log - Mode: {mode}, Preemption: {ev_preemption}\n")
        self.file_handle.write("="*80 + "\n\n")
        self.file_handle.flush()
    
    def __del__(self):
        if hasattr(self, 'file_handle') and self.file_handle:
            try:
                self.file_handle.close()
            except:
                pass

    def log_simulation_start(self):
        """Log the start of a simulation run"""
        preempt_status = "with_preempt" if self.ev_preemption else "no_preempt"
        self.file_handle.write(f"\n{'='*80}\n")
        self.file_handle.write(f"--- NEW SIMULATION RUN: {self._resolve_mode_label(self.mode, self.ev_preemption).upper()} | Preemption: {preempt_status.upper()} ---\n")
        self.file_handle.write(f"{'='*80}\n\n")
        self.file_handle.flush()
    
    def log_simulation_end(self, sim_time):
        """Log the end of a simulation run"""
        self.log_event(sim_time, self.mode, self.ev_preemption, "SIMULATION_END", "ALL",
                      f"Simulation completed at step {sim_time}")
        self.file_handle.flush()
    
    def log_event(self, step, mode, ev_preemption, event_type, direction, details=""):
        """Log an event"""
        mode_label = self._resolve_mode_label(mode, ev_preemption)
        emoji = self._get_event_emoji(event_type)
        self.file_handle.write(f"[Step {step}] {emoji} MODE: {mode_label} | {event_type} | "
               f"DIR: {direction} | {details}\n")

    def log_emergency_lifecycle(self, step, phase, ev_id, direction, details=""):
        """Specialized logging for emergency vehicle lifecycle"""
        mode_label = self._resolve_mode_label(self.mode, self.ev_preemption)
        
        if phase == "DETECTED":
            self.file_handle.write(f"\n--- 🚨 EMERGENCY VEHICLE [Step {step}] ---\n")
            self.file_handle.write(f"[Step {step}] MODE: {mode_label} | EV_DETECTED | ")
            self.file_handle.write(f"DIR: {direction} | ID: {ev_id} | {details}\n")
        
        elif phase == "PREEMPT_ACTIVE":
            self.file_handle.write(f"[Step {step}] MODE: {mode_label} | 🟢 PREEMPTION_ACTIVATED | ")
            self.file_handle.write(f"DIR: {direction} | ID: {ev_id} | {details}\n")
        
        elif phase == "EV_APPROACHING":
            self.file_handle.write(f"[Step {step}] MODE: {mode_label} | EV_APPROACHING | ")
            self.file_handle.write(f"DIR: {direction} | ID: {ev_id} | {details}\n")
        
        elif phase == "EV_PASSED":
            self.file_handle.write(f"[Step {step}] MODE: {mode_label} | EV_PASSED | ")
            self.file_handle.write(f"DIR: {direction} | ID: {ev_id} | {details}\n")
        
        elif phase == "EV_CLEARED_NETWORK":
            self.file_handle.write(f"[Step {step}] MODE: {mode_label} | ✅ EV_CLEARED | ")
            self.file_handle.write(f"DIR: {direction} | ID: {ev_id} | {details}\n")
        
        elif phase == "PREEMPT_DEACTIVATED":
            self.file_handle.write(f"[Step {step}] MODE: {mode_label} | 🔴 PREEMPTION_DEACTIVATED | ")
            self.file_handle.write(f"DIR: {direction} | Returning to normal\n")
            self.file_handle.write(f"--- END EMERGENCY VEHICLE [Step {step}] ---\n\n")

    def log_ev_waiting_priority(self, step, waiting_ev_id, active_direction):
        """
        Log when an EV must wait because another EV direction has the lock.
        This tracks the 'Trapping' prevention logic in action.
        """
        mode_label = self._resolve_mode_label(self.mode, self.ev_preemption)
        self.file_handle.write(f"[Step {step}] ⏳ CROSS_PRIORITY | MODE: {mode_label} | "
            f"EV {waiting_ev_id} WAITING | Active Lock: {active_direction} direction has priority.\n")

    @staticmethod
    def _resolve_mode_label(mode, ev_preemption):
        mode_str = str(mode)
        if mode_str.endswith("_with_preempt") or mode_str.endswith("_no_preempt"):
            return mode_str
        preempt_status = "with_preempt" if ev_preemption else "no_preempt"
        return f"{mode_str}_{preempt_status}"

    def _get_event_emoji(self, event_type):
        emoji_map = {
            "EV_DETECTED": "🚨",
            "EV_PREEMPT": "🚨",
            "PREEMPT_ACTIVE": "🟢",
            "EV_CLEARED": "✅",
            "PREEMPT_END": "🔴",
            "PREEMPT_LAYER_SWITCH": "🧭",
            "PREEMPT_STALE_SAMPLE": "🧪",
            "CROSS_PRIORITY": "⏳",
            "EV_TRANSITION": "🔄",
            "ADAPTIVE_SWITCH": "🔄",
            "MAX_GREEN": "⏰",
            "BUS_PRIORITY": "🚌",
            "SIMULATION_START": "▶️",
            "SIMULATION_END": "⏹️",
            "THRESHOLD_TRACE": "📊",
            "INCIDENT_DETECTED": "⚠️",
            "PED_PREEMPT": "🚶"
        }
        return emoji_map.get(event_type, "•")
