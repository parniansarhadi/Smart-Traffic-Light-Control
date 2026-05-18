"""
SUMO Simulation Unit - Traffic signal control and simulation framework.

Organized into logical modules:
- core: Main simulation engine (main, simulation_manager)
- api: API server interface
- network: Network topology and traffic generation
- traffic_control: Traffic light control and pedestrian handling
- priority: Priority and preemption system
- metrics: Data collection and analysis
- logging: Simulation logging
- optimization: Parameter tuning and grid search
- utilities: Shared utility functions and helpers
- constants: Shared constants and enumerations
"""

__version__ = "1.0.0"

# Import path utilities
from .utilities.path_utils import (
    find_workspace_root,
    get_workspace_root,
    get_sumo_config_dir,
    get_sys_output_dir,
)
from .utilities.json_utils import load_json, write_json
from .utilities.config_utils import extract_config_params, extract_config_value

# Import constants
from .constants.direction_constants import Direction, EdgeID, PhaseState
from .constants.vehicle_utils import VehicleType, VEHICLE_CHARACTERISTICS, DEFAULT_VEHICLE_DISTRIBUTION

__all__ = [
    # Path utilities
    "find_workspace_root",
    "get_workspace_root",
    "get_sumo_config_dir",
    "get_sys_output_dir",
    # JSON utilities
    "load_json",
    "write_json",
    # Config utilities
    "extract_config_params",
    "extract_config_value",
    # Direction constants
    "Direction",
    "EdgeID",
    "PhaseState",
    # Vehicle constants
    "VehicleType",
    "VEHICLE_CHARACTERISTICS",
    "DEFAULT_VEHICLE_DISTRIBUTION",
]
