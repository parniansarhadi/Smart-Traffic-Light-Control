class DurationTracker:
    """Tracks durations of green and red phases"""
    
    def __init__(self):
        self.durations = {
            "NS_green": {"max": 0, "current": 0},
            "EW_green": {"max": 0, "current": 0},
            "NS_red": {"max": 0, "current": 0},
            "EW_red": {"max": 0, "current": 0}
        }
    
    def update(self, ns_is_g, ew_is_g):
        """Update duration counters based on current state"""
        
        # Update NS
        if ns_is_g:
            self.durations["NS_green"]["current"] += 1
            self.durations["NS_red"]["max"] = max(self.durations["NS_red"]["max"], self.durations["NS_red"]["current"])
            self.durations["NS_red"]["current"] = 0
        else:
            self.durations["NS_red"]["current"] += 1
            self.durations["NS_green"]["max"] = max(self.durations["NS_green"]["max"], self.durations["NS_green"]["current"])
            self.durations["NS_green"]["current"] = 0
        
        # Update EW
        if ew_is_g:
            self.durations["EW_green"]["current"] += 1
            self.durations["EW_red"]["max"] = max(self.durations["EW_red"]["max"], self.durations["EW_red"]["current"])
            self.durations["EW_red"]["current"] = 0
        else:
            self.durations["EW_red"]["current"] += 1
            self.durations["EW_green"]["max"] = max(self.durations["EW_green"]["max"], self.durations["EW_green"]["current"])
            self.durations["EW_green"]["current"] = 0
    
    def get_durations(self):
        return self.durations
    
    def get_red_time(self, direction):
        return self.durations[f"{direction}_red"]["current"]
    
    def get_green_time(self, direction):
        return self.durations[f"{direction}_green"]["current"]