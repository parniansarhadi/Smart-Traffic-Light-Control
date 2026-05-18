from ..utilities.traffic_light_utils import get_dynamic_max_red
from ..constants.direction_constants import Direction

class StarvationMonitor:
    def __init__(self, logger, ns_idx=0, ew_idx=3, dynamic_red_config=None):
        self.logger = logger
        self.ns_idx = ns_idx
        self.ew_idx = ew_idx
        self.ew_starved = False
        self.ns_starved = False
        self.comp_applied = False
        self.dynamic_red_config = dynamic_red_config or {}
        self.threshold = self.dynamic_red_config.get("base_red", 45)
        self.comp_duration = self.dynamic_red_config.get("compensation_duration", 15)

    def check_starvation(self, durations, ns_is_g, ew_is_g, qdr_tracker=None, ns_lanes=None, ew_lanes=None):
        data = durations.get_durations()

        # Network-wide congestion how long red can be tolerated.
        max_red_limit = self.dynamic_red_config.get("max_red_limit", 180)
        max_congestion_vehicles = self.dynamic_red_config.get("max_congestion_vehicles", 80)
        dynamic_threshold = get_dynamic_max_red(
            base_red=self.threshold,
            max_red_limit=max_red_limit,
            max_congestion_vehicles=max_congestion_vehicles,
        )
        if dynamic_threshold is None:
            return None

        if qdr_tracker:
            curr_dir = Direction.NS if ns_is_g else (Direction.EW if ew_is_g else None)
            if curr_dir and qdr_tracker.get_stats(curr_dir)["avg"] < 0.6:
                # Give a slow-clearing direction more time before forcing a starvation switch
                dynamic_threshold += self.comp_duration
                
        # Starvation should only be triggered if the direction actually has lanes to serve.
        if ns_lanes and data["NS_red"]["current"] > dynamic_threshold and not ns_is_g:
            self.ns_starved = True
            return {"type": "force_switch", "target_direction": Direction.NS}
        elif ew_lanes and data["EW_red"]["current"] > dynamic_threshold and not ew_is_g:
            self.ew_starved = True
            return {"type": "force_switch", "target_direction": Direction.EW}
        return None

    def update_compensation_status(self, ns_is_g, ew_is_g):
        if (ew_is_g and self.ew_starved) or (ns_is_g and self.ns_starved):
            if not self.comp_applied:
                self.comp_applied = True
                self.ew_starved = self.ns_starved = False
        if not ns_is_g and not ew_is_g: self.comp_applied = False