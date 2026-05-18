export type DirectionAvailability = {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
};

export type NetworkLayoutSummary = {
  directionAvailability: DirectionAvailability;
  nsAxis: boolean;
  ewAxis: boolean;
  availableDirections: string[];
  missingDirections: string[];
  hasAnyDirection: boolean;
};

export const DEFAULT_DIRECTION_AVAILABILITY: DirectionAvailability = {
  north: true,
  south: true,
  east: true,
  west: true,
};

export function buildNetworkLayoutSummary(
  directionAvailability?: Partial<DirectionAvailability> | null
): NetworkLayoutSummary {
  const normalized: DirectionAvailability = {
    north: Boolean(directionAvailability?.north ?? DEFAULT_DIRECTION_AVAILABILITY.north),
    south: Boolean(directionAvailability?.south ?? DEFAULT_DIRECTION_AVAILABILITY.south),
    east: Boolean(directionAvailability?.east ?? DEFAULT_DIRECTION_AVAILABILITY.east),
    west: Boolean(directionAvailability?.west ?? DEFAULT_DIRECTION_AVAILABILITY.west),
  };

  const availableDirections: string[] = [];
  const missingDirections: string[] = [];

  if (normalized.north) availableDirections.push("N");
  else missingDirections.push("N");
  if (normalized.south) availableDirections.push("S");
  else missingDirections.push("S");
  if (normalized.east) availableDirections.push("E");
  else missingDirections.push("E");
  if (normalized.west) availableDirections.push("W");
  else missingDirections.push("W");

  const nsAxis = normalized.north && normalized.south;
  const ewAxis = normalized.east && normalized.west;

  return {
    directionAvailability: normalized,
    nsAxis,
    ewAxis,
    availableDirections,
    missingDirections,
    hasAnyDirection: nsAxis || ewAxis,
  };
}
