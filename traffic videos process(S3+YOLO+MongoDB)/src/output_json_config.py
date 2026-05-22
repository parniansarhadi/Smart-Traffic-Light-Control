# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_lane_stats(objects, passed_counts=None):
    """Split an objects list into vehicles / bus / emergency_vehicles sub-sections."""
    car_classes       = {"car"}
    truck_classes     = {"truck"}
    motorcycle_classes= {"motorcycle"}
    bus_classes       = {"bus"}
    emergency_classes = {"ambulance"}

    cars        = [o for o in objects if o["class"] in car_classes]
    trucks      = [o for o in objects if o["class"] in truck_classes]
    motorcycles = [o for o in objects if o["class"] in motorcycle_classes]
    buses       = [o for o in objects if o["class"] in bus_classes]
    emergencies = [o for o in objects if o["class"] in emergency_classes]
    regular     = cars + trucks + motorcycles
    passed_counts = passed_counts or {}

    def _avg_speed(lst):
        return round(sum(o["speed"] for o in lst) / len(lst), 1) if lst else 0.0

    def _max_wait(lst):
        return round(max((o["waiting_time"] for o in lst), default=0.0), 1)

    def _total_wait(lst):
        return round(sum(o["waiting_time"] for o in lst), 1)

    max_waiting_type = "none"
    if regular:
        max_waiting_type = max(regular, key=lambda o: o["waiting_time"])["class"]

    vehicles = {
        "cars_count":        len(cars),
        "cars_passed":       int(passed_counts.get("car", 0)),
        "trucks_count":      len(trucks),
        "trucks_passed":     int(passed_counts.get("truck", 0)),
        "motorcycles_count": len(motorcycles),
        "motorcycles_passed": int(passed_counts.get("motorcycle", 0)),
        "max_waiting_time":  _max_wait(regular),
        "max_waiting_type":  max_waiting_type,
        "total_waiting_time":_total_wait(regular),
        "avg_speed":         _avg_speed(regular),
    }
    bus_stats = {
        "bus_count":             len(buses),
        "bus_passed":            int(passed_counts.get("bus", 0)),
        "max_waiting_time_pt":   _max_wait(buses),
        "total_waiting_time_pt": _total_wait(buses),
        "avg_speed_pt":          _avg_speed(buses),
    }
    ev_stats = {
        "emergency_vehicles_count": len(emergencies),
        "emergency_vehicles_passed": int(passed_counts.get("ambulance", 0)),
        "max_waiting_time_ev":      _max_wait(emergencies),
        "total_waiting_time_ev":    _total_wait(emergencies),
        "avg_speed_ev":             _avg_speed(emergencies),
    }
    return vehicles, bus_stats, ev_stats


def _scale_ped_count(value):
    return int(round(float(value)))


def _ped_entry(pedestrians_data, direction_id, crossing_from=None):
    """Build one pedestrian entry dict for a lane's pedestrians list."""
    peds      = pedestrians_data or []
    ped       = next((p for p in peds if p.get("direction") == direction_id), {})
    cross_src = next((p for p in peds if p.get("direction") == crossing_from), {}) if crossing_from else {}
    return {
        "direction":              direction_id,
        "ped_count":              _scale_ped_count(ped.get("waiting_count", 0)),
        "crossing_count":         int(cross_src.get("crossing_count", ped.get("crossing_count", 0))),
        "total_waiting_time_ped": 0.0,
        "max_waiting_time_ped":   0,
    }


# Mapping: vehicle lane direction_id -> list of (ped_direction, crossing_from | None)
# SOUTHTONORTH owns the real pedestrian ROIs; every other lane gets LR/RL stubs.
_LANE_PED_MAP = {
    "SOUTHTONORTH": [
        ("EASTTOWEST", "MAIN_CROSSING"),
        ("WESTTOEAST", None),
    ],
}

_STUB_PED = [
    {"direction": "LR", "ped_count": 0, "crossing_count": 0,
     "total_waiting_time_ped": 0.0, "max_waiting_time_ped": 0},
    {"direction": "RL", "ped_count": 0, "crossing_count": 0,
     "total_waiting_time_ped": 0.0, "max_waiting_time_ped": 0},
]


def _ped_entry_from_raw(ped):
    return {
        "direction": ped.get("direction", "none"),
        "ped_count": _scale_ped_count(ped.get("waiting_count", 0)),
        "crossing_count": int(ped.get("crossing_count", 0)),
        "total_waiting_time_ped": 0.0,
        "max_waiting_time_ped": 0,
    }


# ---------------------------------------------------------------------------
# Public builder  (called once per second)
# ---------------------------------------------------------------------------

def build_final_payload(camera_id, timestamp_str, lights_data, lanes_data, emergency_data, pedestrians_data, lane_passed_data=None):
    """Assemble a single per-second JSON record in the downstream contract format."""

    # ── Light ─────────────────────────────────────────────────────────────────
    light_list = []
    for light in (lights_data or []):
        status = light.get("status", {})
        active = {k: float(v) for k, v in status.items() if k in {"red", "yellow", "green"} and float(v) > 0.0}
        light_item = {
            "direction": light.get("direction_id", "none"),
        }
        light_item.update(active)
        light_list.append(light_item)

    # ── Lanes ─────────────────────────────────────────────────────────────────
    lanes_output = []
    lane_passed_data = lane_passed_data or {}
    for lane in (lanes_data or []):
        direction = lane["direction"]
        objects   = lane.get("objects", [])
        vehicles, bus_stats, ev_stats = _build_lane_stats(
            objects,
            passed_counts=lane_passed_data.get(direction, {}),
        )

        ped_specs = _LANE_PED_MAP.get(direction)
        if ped_specs:
            pedestrians = [_ped_entry(pedestrians_data, d, c) for d, c in ped_specs]
        else:
            if pedestrians_data:
                pedestrians = [_ped_entry_from_raw(p) for p in pedestrians_data]
            else:
                pedestrians = [dict(e) for e in _STUB_PED]

        lanes_output.append({
            "direction":          direction,
            "vehicles":           vehicles,
            "bus":                bus_stats,
            "emergency_vehicles": ev_stats,
            "pedestrians":        pedestrians,
        })

    return {
        "cameraID": str(camera_id),
        "datetime": timestamp_str,
        "light":    light_list,
        "lanes":    lanes_output,
    }