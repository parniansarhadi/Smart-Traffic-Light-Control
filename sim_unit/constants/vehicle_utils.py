"""Utilities for vehicle type classification and metrics."""

# Vehicle type constants
class VehicleType:
    """Standard vehicle types in SUMO simulation."""
    CAR = "car"
    TRUCK = "truck"
    MOTORCYCLE = "motorcycle"
    BUS = "bus"
    EMERGENCY = "emergency"
    PEDESTRIAN = "pedestrian"
    
    # All vehicle types
    ALL = [CAR, TRUCK, MOTORCYCLE, BUS, EMERGENCY, PEDESTRIAN]
    
    # Non-pedestrian types
    VEHICLE_TYPES = [CAR, TRUCK, MOTORCYCLE, BUS, EMERGENCY]


# Vehicle characteristics
VEHICLE_CHARACTERISTICS = {
    VehicleType.CAR: {
        "color": "orange",
        "v_class": "passenger",
        "gui_shape": "passenger",
        "priority": 1.0,
    },
    VehicleType.TRUCK: {
        "color": "green",
        "v_class": "truck",
        "gui_shape": "truck",
        "priority": 0.8,
    },
    VehicleType.MOTORCYCLE: {
        "color": "red",
        "v_class": "motorcycle",
        "gui_shape": "motorcycle",
        "priority": 1.2,
    },
    VehicleType.BUS: {
        "color": "yellow",
        "v_class": "bus",
        "gui_shape": "bus",
        "priority": 0.6,
    },
    VehicleType.EMERGENCY: {
        "color": "white",
        "v_class": "emergency",
        "gui_shape": "emergency",
        "priority": 2.0,
    },
    VehicleType.PEDESTRIAN: {
        "color": "blue",
        "v_class": "pedestrian",
        "gui_shape": "pedestrian",
        "priority": 0.5,
    },
}


def is_vehicle_type(v_type):
    """Check if string is a valid vehicle type."""
    return v_type in VehicleType.ALL


def categorize_vehicle(v_type):
    """
    Categorize vehicle type.
    """
    type_lower = str(v_type).lower().strip()
    
    if type_lower in VehicleType.ALL:
        return type_lower
    
    aliases = {
        "passenger": VehicleType.CAR,
        "private": VehicleType.CAR,
        "car": VehicleType.CAR,
        "emerg": VehicleType.EMERGENCY,
        "ped": VehicleType.PEDESTRIAN,
    }
    
    if type_lower in aliases:
        return aliases[type_lower]
    
    raise ValueError(f"Unknown vehicle type: {v_type}")


def get_vehicle_priority(v_type):
    """Get preemption priority for a vehicle type."""
    try:
        v_type = categorize_vehicle(v_type)
        return VEHICLE_CHARACTERISTICS[v_type]["priority"]
    except (ValueError, KeyError):
        return 1.0


def get_vehicle_color(v_type):
    try:
        v_type = categorize_vehicle(v_type)
        return VEHICLE_CHARACTERISTICS[v_type]["color"]
    except (ValueError, KeyError):
        return "gray"


def get_vehicle_characteristics(v_type):
    """Get all characteristics for a vehicle type."""
    v_type = categorize_vehicle(v_type)
    return VEHICLE_CHARACTERISTICS.get(v_type, {})


# Distribution weights for traffic generation
DEFAULT_VEHICLE_DISTRIBUTION = {
    VehicleType.CAR: 0.70,
    VehicleType.TRUCK: 0.10,
    VehicleType.MOTORCYCLE: 0.10,
    VehicleType.BUS: 0.08,
    VehicleType.EMERGENCY: 0.02,
}


def get_distribution_weights():
    """Get default vehicle type distribution weights."""
    return DEFAULT_VEHICLE_DISTRIBUTION.copy()
