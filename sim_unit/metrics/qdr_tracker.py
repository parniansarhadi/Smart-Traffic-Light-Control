from .data_collector import QueueCalculator

class QDRTracker:
    def __init__(self, ns_lanes, ew_lanes):
        self.ns_lanes = ns_lanes
        self.ew_lanes = ew_lanes
        self.qdr_data = {"NS": [], "EW": []}
        self.active_qdr = {"direction": None, "start_step": 0, "start_queue": 0}
        self.live_rate = {"NS": 0.0, "EW": 0.0}

    def update(self, step, ns_lanes, ew_lanes, ns_is_g, ew_is_g, lane_data):
        curr_dir = "NS" if ns_is_g else ("EW" if ew_is_g else None)
        q_evt = None
        if curr_dir and self.active_qdr["direction"] != curr_dir:
            self.active_qdr = {
                "direction": curr_dir, 
                "start_step": step,
                "start_queue": QueueCalculator.calculate_queue(self.ns_lanes if curr_dir == "NS" else self.ew_lanes, lane_data)
            }
        if self.active_qdr["direction"]:
            d = self.active_qdr["direction"]
            curr_q = QueueCalculator.calculate_queue(self.ns_lanes if d == "NS" else self.ew_lanes, lane_data)
            dur = step - self.active_qdr["start_step"]
            
            if dur > 0:
                self.live_rate[d] = max(0.0, (self.active_qdr["start_queue"] - curr_q) / dur)
                
            if curr_q == 0 or (d == "NS" and not ns_is_g) or (d == "EW" and not ew_is_g):
                if dur > 0 and self.active_qdr["start_queue"] > 0:
                    rate = (self.active_qdr["start_queue"] - curr_q) / dur
                    self.qdr_data[d].append(max(0.0, rate))
                    q_evt = {"direction": d, "rate": rate}
                self.active_qdr["direction"] = None
        return q_evt
        
    def get_stats(self, direction):
    
        if direction not in self.qdr_data:
            return {"avg": 1.0, "recent": 1.0, "moving_avg": 1.0}

        data = self.qdr_data[direction]
        avg = sum(data)/len(data) if data else 1.0
        live = self.live_rate.get(direction, 0.0)
        recent = live if live > 0 else avg
        ma = sum(data[-5:])/len(data[-5:]) if data else 1.0
        return {"avg": avg, "recent": recent, "moving_avg": ma}