

export const Direction = {
  NORTH_SOUTH: "NORTH_SOUTH",
  SOUTH_NORTH: "SOUTH_NORTH",
  EAST_WEST: "EAST_WEST",
  WEST_EAST: "WEST_EAST",

  NS: "NS",
  SN: "SN",
  EW: "EW",
  WE: "WE",

  NORTH: "NORTH",
  SOUTH: "SOUTH",
  EAST: "EAST",
  WEST: "WEST",
} as const;

export type DirectionType = typeof Direction[keyof typeof Direction];

export const EdgeID = {

  N2C: "N2C",
  C2S: "C2S",
  S2C: "S2C",
  C2N: "C2N",

  E2C: "E2C",
  C2W: "C2W",
  W2C: "W2C",
  C2E: "C2E",
} as const;

export type EdgeIDType = typeof EdgeID[keyof typeof EdgeID];

export const VehicleType = {
  CAR: "car",
  TRUCK: "truck",
  MOTORCYCLE: "motorcycle",
  BUS: "bus",
  EMERGENCY: "emergency",
  PEDESTRIAN: "pedestrian",
} as const;

export type VehicleTypeType = typeof VehicleType[keyof typeof VehicleType];

export const SignalAspect = {
  RED: "red",
  YELLOW: "yellow",
  GREEN: "green",
  OFF: "off",
} as const;

export type SignalAspectType = typeof SignalAspect[keyof typeof SignalAspect];

export const PhaseState = {
  NS_GREEN: "GGGrrrrrr",
  EW_GREEN: "rrrGGGGGG",
  ALL_RED: "rrrrrrrrr",
} as const;

export const VehicleCharacteristics: Record<
  VehicleTypeType,
  { color: string; priority: number; icon?: string }
> = {
  car: { color: "#FF8C00", priority: 1.0, icon: "🚗" },
  truck: { color: "#228B22", priority: 0.8, icon: "🚚" },
  motorcycle: { color: "#FF0000", priority: 1.2, icon: "🏍️" },
  bus: { color: "#FFFF00", priority: 0.6, icon: "🚌" },
  emergency: { color: "#FFFFFF", priority: 2.0, icon: "🚨" },
  pedestrian: { color: "#0000FF", priority: 0.5, icon: "🚶" },
};

export const DefaultVehicleDistribution: Record<VehicleTypeType, number> = {
  car: 0.7,
  truck: 0.1,
  motorcycle: 0.1,
  bus: 0.08,
  emergency: 0.02,
  pedestrian: 0.0, 
};

export const ApiEndpoints = {
  NETWORK_GEOMETRY: "/api/network-geometry",
  SIMULATION_DATA: "/api/simulation-data",
  RESULTS_IMAGE: "/api/results-image",
} as const;

export const HttpStatus = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const TimeConstants = {
  MIN_PHASE_DURATION: 5,
  MAX_PHASE_DURATION: 180,
  DEFAULT_CYCLE_TIME: 60,
  PREEMPTION_HOLD_TIME: 25,
} as const;

export function getDirectionOpposite(
  direction: DirectionType
): DirectionType | undefined {
  const opposites: Record<DirectionType, DirectionType | undefined> = {
    [Direction.NORTH_SOUTH]: Direction.SOUTH_NORTH,
    [Direction.SOUTH_NORTH]: Direction.NORTH_SOUTH,
    [Direction.EAST_WEST]: Direction.WEST_EAST,
    [Direction.WEST_EAST]: Direction.EAST_WEST,
    [Direction.NS]: Direction.SN,
    [Direction.SN]: Direction.NS,
    [Direction.EW]: Direction.WE,
    [Direction.WE]: Direction.EW,
    [Direction.NORTH]: Direction.SOUTH,
    [Direction.SOUTH]: Direction.NORTH,
    [Direction.EAST]: Direction.WEST,
    [Direction.WEST]: Direction.EAST,
  };
  return opposites[direction];
}

export function isValidDirection(value: unknown): value is DirectionType {
  return Object.values(Direction).includes(value as DirectionType);
}

export function isValidVehicleType(value: unknown): value is VehicleTypeType {
  return Object.values(VehicleType).includes(value as VehicleTypeType);
}

export function getVehicleColor(vehicleType: VehicleTypeType): string {
  return VehicleCharacteristics[vehicleType]?.color ?? "#CCCCCC";
}

export function getVehiclePriority(vehicleType: VehicleTypeType): number {
  return VehicleCharacteristics[vehicleType]?.priority ?? 1.0;
}
