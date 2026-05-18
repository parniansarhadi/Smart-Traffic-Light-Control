import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { readFilesByExtension } from "../_lib/file-utils";
import { resolveWorkspaceRoot } from "../_lib/workspace-root";
import {
  successResponse,
  clientErrorResponse,
  tryCatch,
} from "../_lib/api-response";
import { buildNetworkLayoutSummary } from "../../_lib/network-layout-summary";

type Point = { x: number; y: number };

type ParsedJunction = {
  id: string;
  x: number;
  y: number;
  type: string;
  incLanes?: string;
};

type ParsedEdge = {
  id: string;
  from: string;
  to: string;
  laneShape?: Point[];
};

type Polyline = {
  id: string;
  points: Point[];
  direction: "north" | "south" | "east" | "west";
  flow: "incoming" | "outgoing";
};

type SignalAspect = "green" | "yellow" | "red";

type ParsedPhase = {
  id: number;
  name: string;
  label: string;
  state: string;
  aspects: {
    north: SignalAspect;
    south: SignalAspect;
    east: SignalAspect;
    west: SignalAspect;
  };
};

export const dynamic = "force-dynamic";

function getAttr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1];
}

function parseShape(shape: string): Point[] {
  return shape
    .trim()
    .split(/\s+/)
    .map((token) => token.split(","))
    .filter((pair) => pair.length >= 2)
    .map(([x, y]) => ({ x: Number(x), y: Number(y) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function resolveNetFile(configDir: string): { netPath: string | null; source: string } {
  const sumocfgFiles = readFilesByExtension(configDir, ".sumocfg");
  if (sumocfgFiles.length > 0) {
    const cfgPath = path.join(configDir, sumocfgFiles[0]);
    const cfgContent = fs.readFileSync(cfgPath, "utf8");
    const netMatch = cfgContent.match(/<net-file[^>]*value="([^"]+)"/i);
    if (netMatch?.[1]) {
      const candidate = path.resolve(configDir, netMatch[1]);
      if (fs.existsSync(candidate)) {
        return { netPath: candidate, source: path.basename(cfgPath) };
      }
    }
  }

  const netFiles = readFilesByExtension(configDir, ".net.xml");
  if (netFiles.length > 0) {
    return { netPath: path.join(configDir, netFiles[0]), source: netFiles[0] };
  }

  return { netPath: null, source: "none" };
}

function directionFromVector(dx: number, dy: number): "north" | "south" | "east" | "west" {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "east" : "west";
  }
  return dy >= 0 ? "north" : "south";
}

function aspectFromStateChar(ch: string | undefined): SignalAspect {
  if (!ch) return "red";
  if (ch === "g" || ch === "G") return "green";
  if (ch === "y" || ch === "Y") return "yellow";
  return "red";
}

function aspectPriority(a: SignalAspect): number {
  if (a === "green") return 3;
  if (a === "yellow") return 2;
  return 1;
}

function edgeToDirection(edgeId: string): "north" | "south" | "east" | "west" | null {
  if (edgeId.startsWith("N2C")) return "north";
  if (edgeId.startsWith("S2C")) return "south";
  if (edgeId.startsWith("E2C")) return "east";
  if (edgeId.startsWith("W2C")) return "west";
  return null;
}

function markDirection(
  availability: { north: boolean; south: boolean; east: boolean; west: boolean },
  dir: "north" | "south" | "east" | "west" | null
) {
  if (!dir) return;
  availability[dir] = true;
}

function hasAnyDirection(availability: {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
}): boolean {
  return availability.north || availability.south || availability.east || availability.west;
}

function directionFromIncomingEdge(
  edge: ParsedEdge | undefined,
  tlJunction: ParsedJunction,
  junctions: Map<string, ParsedJunction>
): "north" | "south" | "east" | "west" | null {
  if (!edge) return null;
  const remote = junctions.get(edge.from);
  if (!remote) return null;
  return directionFromVector(remote.x - tlJunction.x, remote.y - tlJunction.y);
}

function parseNetGeometry(netXml: string): {
  tlJunctionId: string | null;
  polylines: Polyline[];
  phases: ParsedPhase[];
  directionAvailability: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
  };
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
} {
  const junctions = new Map<string, ParsedJunction>();
  const junctionTagRegex = /<junction\b([^>]*?)(?:\/>|>)/g;
  let junctionMatch: RegExpExecArray | null;

  while ((junctionMatch = junctionTagRegex.exec(netXml)) !== null) {
    const tag = junctionMatch[1];
    const id = getAttr(tag, "id");
    const x = Number(getAttr(tag, "x"));
    const y = Number(getAttr(tag, "y"));
    const type = getAttr(tag, "type") ?? "";
    const incLanes = getAttr(tag, "incLanes");

    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    junctions.set(id, { id, x, y, type, incLanes });
  }

  const tlJunction =
    junctions.get("center") ??
    Array.from(junctions.values()).find((j) => j.type === "traffic_light") ??
    Array.from(junctions.values())[0] ??
    null;

  if (!tlJunction) {
    return {
      tlJunctionId: null,
      polylines: [],
      phases: [],
      directionAvailability: { north: false, south: false, east: false, west: false },
      bounds: null,
    };
  }

  const edges: ParsedEdge[] = [];
  const edgeBlockRegex = /<edge\b([^>]*?)>([\s\S]*?)<\/edge>/g;
  let edgeBlockMatch: RegExpExecArray | null;

  while ((edgeBlockMatch = edgeBlockRegex.exec(netXml)) !== null) {
    const edgeAttrs = edgeBlockMatch[1];
    const block = edgeBlockMatch[2];
    const id = getAttr(edgeAttrs, "id");
    const from = getAttr(edgeAttrs, "from");
    const to = getAttr(edgeAttrs, "to");

    if (!id || !from || !to) continue;
    if (id.startsWith(":")) continue;

    const laneTagMatch = block.match(/<lane\b([^>]*?)\/>/);
    const laneShapeRaw = laneTagMatch ? getAttr(laneTagMatch[1], "shape") : undefined;
    const laneShape = laneShapeRaw ? parseShape(laneShapeRaw) : undefined;

    edges.push({ id, from, to, laneShape });
  }

  const relevant = edges.filter((edge) => edge.from === tlJunction.id || edge.to === tlJunction.id);

  const edgeById = new Map<string, ParsedEdge>();
  edges.forEach((edge) => edgeById.set(edge.id, edge));

  const directionAvailability = {
    north: false,
    south: false,
    east: false,
    west: false,
  };

  relevant.forEach((edge) => {
    if (edge.to !== tlJunction.id) return;
    const dir = directionFromIncomingEdge(edge, tlJunction, junctions);
    markDirection(directionAvailability, dir);
  });

  const polylines: Polyline[] = relevant
    .map((edge) => {
      const points = edge.laneShape ?? [];
      if (points.length < 2) return null;

      const remoteId = edge.to === tlJunction.id ? edge.from : edge.to;
      const remote = junctions.get(remoteId);
      if (!remote) return null;

      const dx = remote.x - tlJunction.x;
      const dy = remote.y - tlJunction.y;

      return {
        id: edge.id,
        points,
        direction: directionFromVector(dx, dy),
        flow: edge.to === tlJunction.id ? "incoming" : "outgoing",
      } satisfies Polyline;
    })
    .filter((value): value is Polyline => Boolean(value));

  const tlLogicRegex = /<tlLogic\b([^>]*?)>([\s\S]*?)<\/tlLogic>/g;
  const connectionRegex = /<connection\b([^>]*?)\/>/g;

  const preferredTlId = tlJunction.id;
  let tlLogicId = preferredTlId;
  let tlLogicBlock = "";
  let tlMatch: RegExpExecArray | null;
  while ((tlMatch = tlLogicRegex.exec(netXml)) !== null) {
    const attrs = tlMatch[1];
    const id = getAttr(attrs, "id") ?? "";
    if (id === preferredTlId || !tlLogicBlock) {
      tlLogicId = id || preferredTlId;
      tlLogicBlock = tlMatch[2] ?? "";
      if (id === preferredTlId) break;
    }
  }

  const indexToDirection = new Map<number, "north" | "south" | "east" | "west">();
  let connMatch: RegExpExecArray | null;
  while ((connMatch = connectionRegex.exec(netXml)) !== null) {
    const attrs = connMatch[1];
    const tl = getAttr(attrs, "tl");
    const linkIndexRaw = getAttr(attrs, "linkIndex");
    const fromEdge = getAttr(attrs, "from") ?? "";
    if (!tl || tl !== tlLogicId) continue;
    if (!linkIndexRaw) continue;
    const linkIndex = Number(linkIndexRaw);
    if (!Number.isFinite(linkIndex)) continue;
    const byGeometry = directionFromIncomingEdge(edgeById.get(fromEdge), tlJunction, junctions);
    const dir = byGeometry ?? edgeToDirection(fromEdge);
    if (!dir) continue;
    indexToDirection.set(linkIndex, dir);
  }

  if (!hasAnyDirection(directionAvailability) && tlJunction.incLanes) {
    const incomingLaneIds = tlJunction.incLanes.split(/\s+/).filter(Boolean);
    incomingLaneIds.forEach((laneId) => {
      const edgeId = laneId.split("_")[0] ?? "";
      const byGeometry = directionFromIncomingEdge(edgeById.get(edgeId), tlJunction, junctions);
      markDirection(directionAvailability, byGeometry ?? edgeToDirection(edgeId));
    });
  }

  if (!hasAnyDirection(directionAvailability)) {
    polylines.forEach((line) => {
      if (line.flow === "incoming") {
        directionAvailability[line.direction] = true;
      }
    });
  }

  const phases: ParsedPhase[] = [];
  if (tlLogicBlock) {
    const phaseRegex = /<phase\b([^>]*?)\/>/g;
    let phaseMatch: RegExpExecArray | null;
    let idx = 0;
    while ((phaseMatch = phaseRegex.exec(tlLogicBlock)) !== null) {
      const attrs = phaseMatch[1];
      const state = getAttr(attrs, "state") ?? "";
      const aspects: ParsedPhase["aspects"] = {
        north: "red",
        south: "red",
        east: "red",
        west: "red",
      };

      for (let i = 0; i < state.length; i += 1) {
        const dir = indexToDirection.get(i);
        if (!dir) continue;
        const aspect = aspectFromStateChar(state[i]);
        if (aspectPriority(aspect) > aspectPriority(aspects[dir])) {
          aspects[dir] = aspect;
        }
      }

      phases.push({
        id: idx,
        name: `Phase ${idx}`,
        label: `N:${aspects.north} S:${aspects.south} E:${aspects.east} W:${aspects.west}`,
        state,
        aspects,
      });
      idx += 1;
    }
  }

  if (polylines.length === 0) {
    return {
      tlJunctionId: tlJunction.id,
      polylines: [],
      phases,
      directionAvailability,
      bounds: null,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  polylines.forEach((line) => {
    line.points.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });

  return {
    tlJunctionId: tlJunction.id,
    polylines,
    phases,
    directionAvailability,
    bounds: { minX, minY, maxX, maxY },
  };
}

export async function GET() {
  return tryCatch(
    async () => {
      const configDir = path.join(resolveWorkspaceRoot(), "sumo_config");

      if (!fs.existsSync(configDir)) {
        return clientErrorResponse(
          "Folder sumo_config not found.",
          "CONFIG_DIR_MISSING",
          404
        );
      }

      const { netPath, source } = resolveNetFile(configDir);
      if (!netPath) {
        return clientErrorResponse(
          "No .sumocfg or .net.xml file found in sumo_config.",
          "NET_FILE_MISSING",
          404
        );
      }

      const xml = fs.readFileSync(netPath, "utf8");
      const parsed = parseNetGeometry(xml);

      return successResponse({
        sourceDir: configDir,
        sourceFile: path.basename(netPath),
        source,
        tlJunctionId: parsed.tlJunctionId,
        bounds: parsed.bounds,
        polylines: parsed.polylines,
        phases: parsed.phases,
        directionAvailability: parsed.directionAvailability,
        networkLayoutSummary: buildNetworkLayoutSummary(parsed.directionAvailability),
        drawableGeometry: Boolean(parsed.bounds && parsed.polylines.length > 0),
        message:
          parsed.bounds && parsed.polylines.length > 0
            ? undefined
            : "No drawable geometry found around the selected traffic light junction. Phase data is still available from tlLogic.",
      });
    },
    "Error while parsing network geometry"
  );
}
