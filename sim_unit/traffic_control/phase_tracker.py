class PhaseTracker:
    """Tracks current green phase and time in phase"""
    
    def __init__(self, traffic_light_setup):
        self.traffic_light_setup = traffic_light_setup
        self.current_green_direction = None
        self.phase_start_time = 0
        self._initialize()
    
    def _initialize(self):
        """Initialize based on current traffic light state"""
        initial_state = self.traffic_light_setup.get_state()
        if 'y' in initial_state.lower():
            self.current_green_direction = "TRANSITION"
        elif self.traffic_light_setup.is_ns_green(initial_state):
            self.current_green_direction = "NS"
        elif self.traffic_light_setup.is_ew_green(initial_state):
            self.current_green_direction = "EW"
        else:
            self.current_green_direction = "PED"
        self.phase_start_time = 0
    
    def update(self, current_time):
        """Update phase tracking based on current state"""
        state = self.traffic_light_setup.get_state()
        is_y = 'y' in state.lower()
        ns_is_g = self.traffic_light_setup.is_ns_green(state)
        ew_is_g = self.traffic_light_setup.is_ew_green(state)
        
        if is_y and self.current_green_direction != "TRANSITION":
            self.current_green_direction = "TRANSITION"
            self.phase_start_time = current_time
        elif not is_y and ns_is_g and self.current_green_direction != "NS":
            self.current_green_direction = "NS"
            self.phase_start_time = current_time
        elif not is_y and ew_is_g and self.current_green_direction != "EW":
            self.current_green_direction = "EW"
            self.phase_start_time = current_time
        elif not is_y and not ns_is_g and not ew_is_g and self.current_green_direction != "PED":
            self.current_green_direction = "PED"
            self.phase_start_time = current_time
        
        return self.current_green_direction
    
    def get_time_in_phase(self, current_time):
        """Get duration of current green phase"""
        if self.current_green_direction:
            return current_time - self.phase_start_time
        return 0
    
    def is_ns_green(self):
        return self.current_green_direction == "NS"
    
    def is_ew_green(self):
        return self.current_green_direction == "EW"