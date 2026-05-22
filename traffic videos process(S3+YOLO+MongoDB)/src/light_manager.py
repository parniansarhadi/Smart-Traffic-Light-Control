class LightManager:
    def __init__(self, config_data, use_cv=False):
        # Configuration data from config.json
        self.config = config_data

        # Default fallback schedule.
        # Format: (start_time_seconds, end_time_seconds, color)
        self.schedule = [
            (0.0, 10.0, "green"),
            (10.0, 35.0, "red"),
            (35.0, 97.0, "green"),
            (97.0, 100.0, "yellow"),
            (100.0, 280.0, "green"),
            (280.0, 283.0, "yellow"),
            (283.0, 315.0, "red"),
            (315.0, 360.0, "green"),
        ]

        # Optional per-intersection override from config.json
        # Example format:
        # "signal_schedule": [{"start": 0, "end": 10, "color": "green"}, ...]
        schedule_items = self.config.get("signal_schedule", [])
        parsed_schedule = []
        for item in schedule_items:
            try:
                start = float(item.get("start", 0.0))
                end = float(item.get("end", 0.0))
                color = str(item.get("color", "")).lower()
                if end > start and color in {"red", "yellow", "green"}:
                    parsed_schedule.append((start, end, color))
            except (TypeError, ValueError):
                continue
        if parsed_schedule:
            self.schedule = parsed_schedule

        self.schedule = sorted(self.schedule, key=lambda x: x[0])
        self.cycle_seconds = max((end for _, end, _ in self.schedule), default=0.0)

    def update(self, frame=None, sim_time=0.0):
        # 1. Find current slot in a repeating cycle schedule.
        current_color = "red"
        elapsed_time = 0.0

        if self.cycle_seconds > 0:
            cycle_time = sim_time % self.cycle_seconds
        else:
            cycle_time = sim_time

        for start, end, color in self.schedule:
            if start <= cycle_time < end:
                current_color = color
                elapsed_time = cycle_time - start
                break

        # 2. Format state into the structure expected by the JSON builder
        state = {"red": 0.0, "yellow": 0.0, "green": 0.0}
        if elapsed_time >= 0:
            state[current_color] = round(elapsed_time, 1)

        # 3. Build the final output list based on config ROIs
        lights_output = []

        # Safely extract traffic_lights from spatial_rois
        rois = self.config.get("spatial_rois", {})
        traffic_lights = rois.get("traffic_lights", [])

        if not traffic_lights:
            active_colors = {c: t for c, t in state.items() if t > 0}
            lights_output.append({
                "direction_id": "GLOBAL",
                "status": active_colors
            })
            return lights_output

        for light_roi in traffic_lights:
            direction = light_roi["direction_id"]

            # Clean up: only keep the color that is currently ON (value > 0)
            active_colors = {c: t for c, t in state.items() if t > 0}

            lights_output.append({
                "direction_id": direction,
                "status": active_colors
            })

        return lights_output