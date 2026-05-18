"""Shared constants and enums for traffic directions and phases."""

# Direction identifiers used in configuration and simulation
class Direction:
    """Traffic direction constants."""
    NORTH_SOUTH = "NORTH_SOUTH"
    SOUTH_NORTH = "SOUTH_NORTH"
    EAST_WEST = "EAST_WEST"
    WEST_EAST = "WEST_EAST"
    
    # Short forms
    NS = "NS"
    SN = "SN"
    EW = "EW"
    WE = "WE"
    
    # Individual directions (for pedestrian crossings)
    NORTH = "NORTH"
    SOUTH = "SOUTH"
    EAST = "EAST"
    WEST = "WEST"
    
    # All bidirectional directions
    ALL_BIDIRECTIONAL = [NORTH_SOUTH, SOUTH_NORTH, EAST_WEST, WEST_EAST]
    ALL_SHORT = [NS, SN, EW, WE]


# SUMO edge IDs used in network
class EdgeID:
    """SUMO edge identifiers for the center intersection."""
    # North-South corridor
    N2C = "N2C"  # North to Center
    C2S = "C2S"  # Center to South
    S2C = "S2C"  # South to Center
    C2N = "C2N"  # Center to North
    
    # East-West corridor
    E2C = "E2C"  # East to Center
    C2W = "C2W"  # Center to West
    W2C = "W2C"  # West to Center
    C2E = "C2E"  # Center to East
    
    # All edges
    ALL = [N2C, C2S, S2C, C2N, E2C, C2W, W2C, C2E]


# Traffic light phase states
class PhaseState:
    """Traffic light phase state strings (SUMO RYOG format: Red=r, Yellow=y, Green=g, Off=o)."""
    # North-South priority (NS green, EW red)
    NS_GREEN = "GGGrrrrrr"
    # East-West priority (EW green, NS red)
    EW_GREEN = "rrrGGGGGG"
    # All red (safety/transition state)
    ALL_RED = "rrrrrrrrr"


# Direction to edge mapping for traffic flow
DIRECTION_TO_EDGES = {
    Direction.NORTH_SOUTH: {
        "from_edge": EdgeID.N2C,
        "to_edge": EdgeID.C2S,
    },
    Direction.SOUTH_NORTH: {
        "from_edge": EdgeID.S2C,
        "to_edge": EdgeID.C2N,
    },
    Direction.EAST_WEST: {
        "from_edge": EdgeID.E2C,
        "to_edge": EdgeID.C2W,
    },
    Direction.WEST_EAST: {
        "from_edge": EdgeID.W2C,
        "to_edge": EdgeID.C2E,
    },
}

# Queue/detector regions (QDR - Queue/Detector Region)
QDR_MAPPING = {
    Direction.NS: Direction.NORTH_SOUTH,
    Direction.SN: Direction.SOUTH_NORTH,
    Direction.EW: Direction.EAST_WEST,
    Direction.WE: Direction.WEST_EAST,
}


def get_direction_edges(direction):
    """Get from/to edge IDs for a given direction."""
    mapping = DIRECTION_TO_EDGES.get(direction)
    if not mapping:
        raise ValueError(f"Unknown direction: {direction}")
    return mapping


def resolve_direction_short_form(short_form):
    """Resolve short form direction (NS, EW, etc.) to full form."""
    return QDR_MAPPING.get(short_form, short_form)


def get_opposite_direction(direction):
    """Get the opposite direction of travel."""
    opposites = {
        Direction.NORTH_SOUTH: Direction.SOUTH_NORTH,
        Direction.SOUTH_NORTH: Direction.NORTH_SOUTH,
        Direction.EAST_WEST: Direction.WEST_EAST,
        Direction.WEST_EAST: Direction.EAST_WEST,
        Direction.NS: Direction.SN,
        Direction.SN: Direction.NS,
        Direction.EW: Direction.WE,
        Direction.WE: Direction.EW,
    }
    return opposites.get(direction)
