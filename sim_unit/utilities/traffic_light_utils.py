import traci


def get_dynamic_max_red(base_red=60, max_red_limit=180, max_congestion_vehicles=100):
    """Calculate dynamic max red time from network-wide halting vehicles."""
    if max_red_limit is None:
        return None

    try:
        halting_vehicles = traci.simulation.getHaltingNumber()
    except Exception:
        halting_vehicles = 0

    congestion_factor = min(halting_vehicles / max_congestion_vehicles, 1.0)
    return base_red + ((max_red_limit - base_red) * congestion_factor)