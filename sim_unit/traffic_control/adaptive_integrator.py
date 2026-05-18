import traci

class AdaptiveIntegrator:
    def __init__(self, logger, priority_system, pedestrian_handler=None):
        self.logger = logger
        self.priority_system = priority_system
        self.pedestrian_handler = pedestrian_handler
        self.controller = None 

    def set_controller(self, controller):
        self.controller = controller
        if self.priority_system:
            self.priority_system.set_controller(controller)

    def calculate_weighted_waits(self, ns_lanes, ew_lanes, use_priority=True, lane_data=None):
    
        ns_wait = sum([traci.lane.getWaitingTime(l) for l in ns_lanes])
        ew_wait = sum([traci.lane.getWaitingTime(l) for l in ew_lanes])
        
        # Soft Priority
        ns_weight, ew_weight, ns_bonus, ew_bonus = self.priority_system.get_composite_weights(ns_wait, ew_wait, ns_lanes, ew_lanes, use_priority)
        
        # Pedestrians
        if self.pedestrian_handler:
            current_dir = self.controller.get_current_direction() if self.controller else None
            ns_weight, ew_weight = self.pedestrian_handler.adjust_waiting_time(ns_weight, ew_weight, current_dir=current_dir)
        
        if not ns_lanes:
            ns_weight = 0
        if not ew_lanes:
            ew_weight = 0
            
        return ns_weight, ew_weight, ns_bonus, ew_bonus

    def sync_on_external_switch(self, current_time):
        if self.controller:
            self.controller.last_switch_step = current_time