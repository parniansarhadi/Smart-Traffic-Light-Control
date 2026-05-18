import traci

class TrafficLightSetup:
    """Handles traffic light phase configuration and state queries"""
    
    def __init__(self, tl_id="center"):
        self.tl_id = tl_id
        self.links = traci.trafficlight.getControlledLinks(tl_id)
        self.slen = len(self.links)
        
        self.ns_indices = []
        self.ew_indices = []
        for i, link_group in enumerate(self.links):
            if not link_group: continue
            from_lane = link_group[0][0]
            if from_lane.startswith("N") or from_lane.startswith("S"):
                self.ns_indices.append(i)
            elif from_lane.startswith("E") or from_lane.startswith("W"):
                self.ew_indices.append(i)
        
    
    def get_state(self):
        return traci.trafficlight.getRedYellowGreenState(self.tl_id)
    
    def is_ns_green(self, state=None):
        if state is None:
            state = self.get_state()
        return any(i < len(state) and state[i].lower() == 'g' for i in self.ns_indices)
    
    def is_ew_green(self, state=None):
        if state is None:
            state = self.get_state()
        return any(i < len(state) and state[i].lower() == 'g' for i in self.ew_indices)

    def is_ns_yellow(self, state=None):
        if state is None:
            state = self.get_state()
        return any(i < len(state) and state[i].lower() == 'y' for i in self.ns_indices)
    
    def is_ew_yellow(self, state=None):
        if state is None:
            state = self.get_state()
        return any(i < len(state) and state[i].lower() == 'y' for i in self.ew_indices)

    def is_ped_green(self, state=None):
        if state is None:
            state = self.get_state()
        return ('G' in state or 'g' in state) and not self.is_ns_green(state) and not self.is_ew_green(state)

    def get_phase_mapping(self):
        """Dynamically finds the primary green phase index for NS, EW, and Pedestrian directions"""
        logics = traci.trafficlight.getAllProgramLogics(self.tl_id)
        logic = next((l for l in logics if l.programID == "fixed_time"), logics[0])
        ns_phase, ew_phase, ped_phase = None, None, None
        for i, phase in enumerate(logic.phases):
            state = phase.state
            if 'y' not in state.lower():
                if self.is_ns_green(state) and not self.is_ew_green(state):
                    ns_phase = i
                elif self.is_ew_green(state) and not self.is_ns_green(state):
                    ew_phase = i
                elif self.is_ped_green(state):
                    ped_phase = i
        return ns_phase, ew_phase, ped_phase