import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { readFilesByPattern } from "../_lib/file-utils";
import { readJsonFileSafe } from "../_lib/json-utils";
import { resolveWorkspaceRoot } from "../_lib/workspace-root";
import { buildNetworkLayoutSummary, type DirectionAvailability } from "../../_lib/network-layout-summary";

type VehicleCountRow = {
  type: string;
  count: number;
};

type VehicleStats = {
  total: number;
  byType: VehicleCountRow[];
};

type CsvRow = Record<string, string>;
type HistoryPoint = Record<string, unknown>;
type HistoryByMode = Record<string, HistoryPoint[]>;
type DashboardSummaryRow = Record<string, unknown>;
type SignalStatus = "green" | "yellow" | "red";

type SignalDurationRange = {
  min: number;
  max: number;
  avg: number;
};

type SignalTimingSummary = {
  simulationStartDateTime: string | null;
  greenToRedChanges: number;
  durations: Record<SignalStatus, SignalDurationRange>;
};

type SignalTimingByConfigRow = {
  config: string;
  simulationStartDateTime: string | null;
  ns: SignalTimingSummary;
  ew: SignalTimingSummary;
};

type CongestionSummaryRow = {
  config: string;
  avgNsQueue: number;
  avgEwQueue: number;
  avgTotalQueue: number;
  peakTotalQueue: number;
  congestionLevel: number;
  samples: number;
  stabilizationTime: number;
};

type Section4NetworkLayoutSummary = ReturnType<typeof buildNetworkLayoutSummary> & {
  generatedAt?: string;
  sourceFile?: string;
};

function derivePedestrianTotalFromSummaryRows(rows: CsvRow[]): number {
  let best = 0;

  rows.forEach((row) => {
    const value = toFiniteNumber(row["Total Pedestrians"]);
    best = Math.max(best, value);
  });

  return best;
}

function deriveVehicleTotalFromSummaryRows(rows: CsvRow[]): number {
  let best = 0;

  rows.forEach((row) => {
    const value = toFiniteNumber(row["Total Vehicles"]);
    best = Math.max(best, value);
  });

  return best;
}

function derivePedestrianTotalFromHistory(historyByMode: HistoryByMode): number {
  let best = 0;

  Object.values(historyByMode).forEach((history) => {
    if (!Array.isArray(history) || history.length === 0) return;

    const sorted = [...history].sort(
      (a, b) => toFiniteNumber(a.step) - toFiniteNumber(b.step)
    );

    let previous: number | null = null;
    let cumulative = 0;

    sorted.forEach((point) => {
      const rootWaiting = toFiniteNumber((point as Record<string, unknown>).ped_count);
      const rootCrossing = toFiniteNumber(
        (point as Record<string, unknown>).ped_crossing_count ??
        (point as Record<string, unknown>).ped_crossing
      );
      const rootTotal = toFiniteNumber((point as Record<string, unknown>).ped_total_count);
      const nestedCount = toFiniteNumber(
        (point as Record<string, unknown>).counts &&
          typeof (point as Record<string, unknown>).counts === "object"
          ? ((point as Record<string, unknown>).counts as Record<string, unknown>).pedestrian
          : 0
      );
      const current = Math.max(rootTotal, rootWaiting + rootCrossing, nestedCount);

      if (previous === null) {
        cumulative += current;
      } else if (current > previous) {
        cumulative += current - previous;
      }
      previous = current;
    });

    best = Math.max(best, cumulative);
  });

  return best;
}

function resolveVehicleTotal(sources: number[]): number {
  for (const value of sources) {
    const parsed = toFiniteNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function derivePedestrianTotalFromDashboardSummary(rows: DashboardSummaryRow[] | null): number {
  if (!Array.isArray(rows)) return 0;

  let best = 0;
  rows.forEach((row) => {
    const raw = row as Record<string, unknown>;
    const value = toFiniteNumber(raw.total_pedestrians ?? raw["Total Pedestrians"]);
    best = Math.max(best, value);
  });
  return best;
}

function deriveVehicleTotalFromDashboardSummary(rows: DashboardSummaryRow[] | null): number {
  if (!Array.isArray(rows)) return 0;

  let best = 0;
  rows.forEach((row) => {
    const raw = row as Record<string, unknown>;
    const value = toFiniteNumber(raw.total_vehicles ?? raw["Total Vehicles"]);
    best = Math.max(best, value);
  });
  return best;
}

function resolvePedestrianTotal(sources: number[]): number {
  for (const value of sources) {
    const parsed = toFiniteNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function deriveVehicleTypesFromDashboardSummary(rows: DashboardSummaryRow[] | null): VehicleCountRow[] {
  if (!Array.isArray(rows)) return [];

  const candidates = rows
    .filter((row) => {
      const rawCounts = (row as Record<string, unknown>).vehicle_type_counts;
      return !!rawCounts && typeof rawCounts === "object";
    })
    .sort(
      (a, b) =>
        toFiniteNumber((b as Record<string, unknown>).total_vehicles ?? (b as Record<string, unknown>)["Total Vehicles"]) -
        toFiniteNumber((a as Record<string, unknown>).total_vehicles ?? (a as Record<string, unknown>)["Total Vehicles"])
    );

  if (candidates.length > 0) {
    const rawCounts = (candidates[0] as Record<string, unknown>).vehicle_type_counts as Record<string, unknown>;
    const entries = Object.entries(rawCounts)
      .map(([type, count]) => ({
        type,
        count: toFiniteNumber(count),
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);

    if (entries.length > 0) return entries;
  }

  return [];
}

export const dynamic = "force-dynamic";

function parseCsv(content: string): CsvRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function readCsvRows(filePath: string): CsvRow[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  return parseCsv(content);
}

function toTitleFromConfig(config: string): string {
  return config
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toFiniteNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeSignalStatus(value: unknown): SignalStatus | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "green" || normalized === "yellow" || normalized === "red") {
    return normalized;
  }

  return null;
}

function buildDurationRange(values: number[]): SignalDurationRange {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0 };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
  };
}

function buildSignalTimingFromHistory(
  history: HistoryPoint[] | undefined,
  statusKey: string,
  simulationStartDateTime: string | null
): SignalTimingSummary {
  const durations: Record<SignalStatus, number[]> = {
    green: [],
    yellow: [],
    red: [],
  };

  const orderedPoints = (history ?? [])
    .map((point) => ({
      step: toFiniteNumber(point.step),
      status: normalizeSignalStatus(point[statusKey]),
    }))
    .filter((point): point is { step: number; status: SignalStatus } => point.status !== null)
    .sort((a, b) => a.step - b.step);

  if (orderedPoints.length === 0) {
    return {
      simulationStartDateTime,
      greenToRedChanges: 0,
      durations: {
        green: { min: 0, max: 0, avg: 0 },
        yellow: { min: 0, max: 0, avg: 0 },
        red: { min: 0, max: 0, avg: 0 },
      },
    };
  }

  let previousStep = orderedPoints[0].step;
  let previousStatus = orderedPoints[0].status;
  let currentRunDuration = 1;
  let greenToRedChanges = 0;
  let sawGreenSinceLastRed = previousStatus === "green";

  for (const point of orderedPoints.slice(1)) {
    const delta = Math.max(1, point.step - previousStep);

    if (point.status === previousStatus) {
      currentRunDuration += delta;
    } else {
      durations[previousStatus].push(currentRunDuration);

      if (point.status === "green") {
        sawGreenSinceLastRed = true;
      } else if (point.status === "red" && sawGreenSinceLastRed) {
        greenToRedChanges += 1;
        sawGreenSinceLastRed = false;
      }

      previousStatus = point.status;
      currentRunDuration = delta;
    }

    previousStep = point.step;
  }

  return {
    simulationStartDateTime,
    greenToRedChanges,
    durations: {
      green: buildDurationRange(durations.green),
      yellow: buildDurationRange(durations.yellow),
      red: buildDurationRange(durations.red),
    },
  };
}

function normalizeSignalTimingSummary(
  value: unknown,
  fallbackSimulationStartDateTime: string | null
): SignalTimingSummary | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const rawDurations = raw.durations as Record<string, unknown> | undefined;

  return {
    simulationStartDateTime: (typeof raw.simulationStartDateTime === "string" && raw.simulationStartDateTime.trim())
      ? raw.simulationStartDateTime.trim()
      : (typeof raw.scenario_start_datetime === "string" && raw.scenario_start_datetime.trim())
        ? raw.scenario_start_datetime.trim()
        : (typeof raw.simulation_start_datetime === "string" && raw.simulation_start_datetime.trim())
          ? raw.simulation_start_datetime.trim()
          : (typeof raw["Simulation Start DateTime"] === "string" && String(raw["Simulation Start DateTime"]).trim())
            ? String(raw["Simulation Start DateTime"]).trim()
            : (typeof raw["Scenario Start DateTime"] === "string" && String(raw["Scenario Start DateTime"]).trim())
              ? String(raw["Scenario Start DateTime"]).trim()
              : fallbackSimulationStartDateTime,
    greenToRedChanges: toFiniteNumber(raw.greenToRedChanges ?? raw.green_to_red_changes),
    durations: {
      green: {
        min: toFiniteNumber(rawDurations?.green && typeof rawDurations.green === "object" ? (rawDurations.green as Record<string, unknown>).min : (raw["NS Green Min Duration"] ?? raw["EW Green Min Duration"] ?? 0)),
        max: toFiniteNumber(rawDurations?.green && typeof rawDurations.green === "object" ? (rawDurations.green as Record<string, unknown>).max : (raw["NS Green Max Duration"] ?? raw["EW Green Max Duration"] ?? 0)),
        avg: toFiniteNumber(rawDurations?.green && typeof rawDurations.green === "object" ? (rawDurations.green as Record<string, unknown>).avg : (raw["NS Green Avg Duration"] ?? raw["EW Green Avg Duration"] ?? 0)),
      },
      yellow: {
        min: toFiniteNumber(rawDurations?.yellow && typeof rawDurations.yellow === "object" ? (rawDurations.yellow as Record<string, unknown>).min : (raw["NS Yellow Min Duration"] ?? raw["EW Yellow Min Duration"] ?? 0)),
        max: toFiniteNumber(rawDurations?.yellow && typeof rawDurations.yellow === "object" ? (rawDurations.yellow as Record<string, unknown>).max : (raw["NS Yellow Max Duration"] ?? raw["EW Yellow Max Duration"] ?? 0)),
        avg: toFiniteNumber(rawDurations?.yellow && typeof rawDurations.yellow === "object" ? (rawDurations.yellow as Record<string, unknown>).avg : (raw["NS Yellow Avg Duration"] ?? raw["EW Yellow Avg Duration"] ?? 0)),
      },
      red: {
        min: toFiniteNumber(rawDurations?.red && typeof rawDurations.red === "object" ? (rawDurations.red as Record<string, unknown>).min : (raw["NS Red Min Duration"] ?? raw["EW Red Min Duration"] ?? 0)),
        max: toFiniteNumber(rawDurations?.red && typeof rawDurations.red === "object" ? (rawDurations.red as Record<string, unknown>).max : (raw["NS Red Max Duration"] ?? raw["EW Red Max Duration"] ?? 0)),
        avg: toFiniteNumber(rawDurations?.red && typeof rawDurations.red === "object" ? (rawDurations.red as Record<string, unknown>).avg : (raw["NS Red Avg Duration"] ?? raw["EW Red Avg Duration"] ?? 0)),
      },
    },
  };
}

function buildSignalTimingByConfig(
  dashboardSummaryRows: DashboardSummaryRow[] | null,
  historyByMode: HistoryByMode,
  simulationStartDateTime: string | null
): SignalTimingByConfigRow[] {
  const rows: SignalTimingByConfigRow[] = [];

  const summaryRows = Array.isArray(dashboardSummaryRows) ? dashboardSummaryRows : [];
  if (summaryRows.length > 0) {
    const uniqueConfigs = new Map<string, SignalTimingByConfigRow>();

    summaryRows.forEach((row) => {
      const config = String((row as Record<string, unknown>).config ?? "Unknown");
      if (uniqueConfigs.has(config)) return; 

      const rawTiming = (row as Record<string, unknown>).signal_timing;

      const nsTiming = normalizeSignalTimingSummary(
        rawTiming && typeof rawTiming === "object" ? (rawTiming as Record<string, unknown>).ns : null,
        simulationStartDateTime
      );
      const ewTiming = normalizeSignalTimingSummary(
        rawTiming && typeof rawTiming === "object" ? (rawTiming as Record<string, unknown>).ew : null,
        simulationStartDateTime
      );

      if (nsTiming && ewTiming) {
        uniqueConfigs.set(config, {
          config,
          simulationStartDateTime:
            nsTiming.simulationStartDateTime ?? ewTiming.simulationStartDateTime ?? simulationStartDateTime,
          ns: nsTiming,
          ew: ewTiming,
        });
        return;
      }

      const history = historyByMode[config] ?? [];
      uniqueConfigs.set(config, {
        config,
        simulationStartDateTime,
        ns: buildSignalTimingFromHistory(history, "ns_light_status", simulationStartDateTime),
        ew: buildSignalTimingFromHistory(history, "ew_light_status", simulationStartDateTime),
      });
    });
    return Array.from(uniqueConfigs.values());
  }

  Object.entries(historyByMode).forEach(([config, history]) => {
    rows.push({
      config,
      simulationStartDateTime,
      ns: buildSignalTimingFromHistory(history, "ns_light_status", simulationStartDateTime),
      ew: buildSignalTimingFromHistory(history, "ew_light_status", simulationStartDateTime),
    });
  });

  return rows;
}

function buildCongestionSummary(
  historyByMode: HistoryByMode,
  dashboardSummaryRows: DashboardSummaryRow[] | null
): CongestionSummaryRow[] {
  const rows = Object.entries(historyByMode).map(([config, history]) => {
    let starvationEvents = 0;
    let throughput = 0;

    if (dashboardSummaryRows) {
      const configTitle = toTitleFromConfig(config);
      const allVehiclesRow = dashboardSummaryRows.find(
        (r) => r.Configuration === configTitle && r.Category === "All Vehicles"
      );
      if (allVehiclesRow) {
        starvationEvents = toFiniteNumber(allVehiclesRow["Starvation Events"]);

        throughput = toFiniteNumber(allVehiclesRow["throughput"] ?? allVehiclesRow["Count"]);
      }
    }

    if (!Array.isArray(history) || history.length === 0) {
      return {
        config,
        avgNsQueue: 0,
        avgEwQueue: 0,
        avgTotalQueue: 0,
        peakTotalQueue: 0,
        congestionLevel: 0,
        starvationEvents,
        throughput,
        preemptionEvents: 0,
        samples: 0,
        avgCongestionIntensity: 0,
        avgCongestionIntensityDemand: 0,
        stabilizationTime: 0,
      };
    }

    let nsSum = 0;
    let ewSum = 0;
    let peakTotalQueue = 0;
    let preemptionEvents = 0;

    let congestionIntensitySumSpatial = 0;
    let congestionIntensitySumDemand = 0;
    history.forEach((point) => {
      const nsQueue = toFiniteNumber(point.ns_queue);
      const ewQueue = toFiniteNumber(point.ew_queue);
      const totalQueue = nsQueue + ewQueue;

      const currentPreemptionTotal = Number(point.preemption_total ?? 0);
      preemptionEvents = Math.max(preemptionEvents, currentPreemptionTotal);

      const nsActive = Number(point.ns_active_count ?? 30);
      const ewActive = Number(point.ew_active_count ?? 30);
      const derivedNsCSpatial = nsQueue <= 2 ? 0 : Math.min(1, nsQueue / 30.0);
      const derivedEwCSpatial = ewQueue <= 2 ? 0 : Math.min(1, ewQueue / 30.0);
      const derivedNsCDemand = nsQueue <= 2 ? 0 : Math.min(1, nsQueue / Math.max(10, nsActive));
      const derivedEwCDemand = ewQueue <= 2 ? 0 : Math.min(1, ewQueue / Math.max(10, ewActive));

      const nsCRawSpatial = Number(point.ns_congestion ?? point.ns_congestion_level ?? point.ns_congestion_ratio ?? Number.NaN);
      const ewCRawSpatial = Number(point.ew_congestion ?? point.ew_congestion_level ?? point.ew_congestion_ratio ?? Number.NaN);
      const nsCSpatial = Number.isFinite(nsCRawSpatial) ? Math.max(0, Math.min(1, nsCRawSpatial)) : derivedNsCSpatial;
      const ewCSpatial = Number.isFinite(ewCRawSpatial) ? Math.max(0, Math.min(1, ewCRawSpatial)) : derivedEwCSpatial;
      congestionIntensitySumSpatial += (nsCSpatial + ewCSpatial) / 2;

      const nsCRawDemand = Number(point.ns_congestion_demand ?? Number.NaN);
      const ewCRawDemand = Number(point.ew_congestion_demand ?? Number.NaN);
      const nsCDemand = Number.isFinite(nsCRawDemand) ? Math.max(0, Math.min(1, nsCRawDemand)) : derivedNsCDemand;
      const ewCDemand = Number.isFinite(ewCRawDemand) ? Math.max(0, Math.min(1, ewCRawDemand)) : derivedEwCDemand;
      congestionIntensitySumDemand += (nsCDemand + ewCDemand) / 2;

      nsSum += nsQueue;
      ewSum += ewQueue;
      peakTotalQueue = Math.max(peakTotalQueue, totalQueue);
    });

    const samples = history.length;
    const avgNsQueue = samples > 0 ? nsSum / samples : 0;
    const avgEwQueue = samples > 0 ? ewSum / samples : 0;
    const avgTotalQueue = avgNsQueue + avgEwQueue;
    const avgCongestionIntensity = samples > 0 ? congestionIntensitySumSpatial / samples : 0;
    const avgCongestionIntensityDemand = samples > 0 ? congestionIntensitySumDemand / samples : 0;

    let stabilizationTime = 0;
    if (samples > 100) {
      const queues = history.map(p => toFiniteNumber(p.ns_queue) + toFiniteNumber(p.ew_queue));

      const targetWindowSize = Math.max(50, Math.floor(samples * 0.15));
      const targetAvg = queues.slice(-targetWindowSize).reduce((a, b) => a + b, 0) / targetWindowSize;

      if (targetAvg > 0.5) {

        for (let i = 0; i < samples - 50; i++) {
          const window = queues.slice(i, i + 50);
          const windowAvg = window.reduce((a, b) => a + b, 0) / 50;
          if (Math.abs(windowAvg - targetAvg) < (targetAvg * 0.15)) {
            stabilizationTime = toFiniteNumber(history[i].step);
            break;
          }
        }
      }
    }

    return {
      config,
      avgNsQueue,
      avgEwQueue,
      avgTotalQueue,
      peakTotalQueue,
      congestionLevel: 0,
      avgCongestionIntensity,
      avgCongestionIntensityDemand,
      starvationEvents,
      throughput,
      preemptionEvents,
      samples,
      stabilizationTime,
    };
  });

  const baseRow = rows.find(r => r.config.toLowerCase().replace(/_/g, " ") === "fixed no preempt");

  const baseAvg = baseRow ? baseRow.avgTotalQueue : (rows.length > 0 ? Math.max(...rows.map(r => r.avgTotalQueue)) : 1);

  return rows
    .map((row) => ({
      ...row,

      congestionLevel: baseAvg > 0 ? (row.avgTotalQueue / baseAvg) * 100 : 0,
    }))
    .sort((a, b) => b.congestionLevel - a.congestionLevel);
}

function countVehiclesFromRoutes(routePath: string): VehicleStats {
  if (!fs.existsSync(routePath)) {
    return { total: 0, byType: [] };
  }

  const xml = fs.readFileSync(routePath, "utf8");
  const vehicleRegex = /<(vehicle|trip)\b([^>]*)>/g;
  const counts = new Map<string, number>();
  let total = 0;
  let match: RegExpExecArray | null;

  while ((match = vehicleRegex.exec(xml)) !== null) {
    const attrs = match[2] ?? "";
    const typeMatch = attrs.match(/\btype="([^"]+)"/i);
    const vType = typeMatch?.[1] ?? "unknown";
    counts.set(vType, (counts.get(vType) ?? 0) + 1);
    total += 1;
  }

  const byType = Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return { total, byType };
}

function estimateFlowCount(flowTagAttrs: string): number {
  const begin = Number((flowTagAttrs.match(/\bbegin="([0-9.]+)"/i)?.[1] ?? "0"));
  const end = Number((flowTagAttrs.match(/\bend="([0-9.]+)"/i)?.[1] ?? "0"));
  const duration = Math.max(0, end - begin);

  const numberRaw = flowTagAttrs.match(/\bnumber="([0-9.]+)"/i)?.[1];
  if (numberRaw) return Math.max(0, Math.round(Number(numberRaw)));

  const probabilityRaw = flowTagAttrs.match(/\bprobability="([0-9.]+)"/i)?.[1];
  if (probabilityRaw) {
    const probability = Number(probabilityRaw);
    if (Number.isFinite(probability) && probability >= 0) {
      return Math.max(0, Math.round(duration * probability));
    }
  }

  const vehsPerHourRaw = flowTagAttrs.match(/\bvehsPerHour="([0-9.]+)"/i)?.[1];
  if (vehsPerHourRaw) {
    const vehsPerHour = Number(vehsPerHourRaw);
    if (Number.isFinite(vehsPerHour) && vehsPerHour >= 0) {
      return Math.max(0, Math.round((duration / 3600) * vehsPerHour));
    }
  }

  const periodRaw = flowTagAttrs.match(/\bperiod="([0-9.]+)"/i)?.[1];
  if (periodRaw) {
    const period = Number(periodRaw);
    if (Number.isFinite(period) && period > 0) {
      return Math.max(0, Math.round(duration / period));
    }
  }

  return 0;
}

function countVehiclesFromFlows(flowPath: string): VehicleStats {
  if (!fs.existsSync(flowPath)) {
    return { total: 0, byType: [] };
  }

  const xml = fs.readFileSync(flowPath, "utf8");
  const flowRegex = /<flow\b([^>]*)>/g;
  const counts = new Map<string, number>();
  let total = 0;
  let match: RegExpExecArray | null;

  while ((match = flowRegex.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const typeMatch = attrs.match(/\btype="([^"]+)"/i);
    const vType = typeMatch?.[1] ?? "unknown";
    const estimated = estimateFlowCount(attrs);
    if (estimated <= 0) continue;
    counts.set(vType, (counts.get(vType) ?? 0) + estimated);
    total += estimated;
  }

  const byType = Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return { total, byType };
}

function mergeVehicleStats(...stats: VehicleStats[]): VehicleStats {
  const merged = new Map<string, number>();
  let total = 0;

  stats.forEach((entry) => {
    total += entry.total;
    entry.byType.forEach((row) => {
      merged.set(row.type, (merged.get(row.type) ?? 0) + row.count);
    });
  });

  return {
    total,
    byType: Array.from(merged.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function countPedestriansFromRoutes(pedRoutePath: string): number {
  if (!fs.existsSync(pedRoutePath)) return 0;

  const xml = fs.readFileSync(pedRoutePath, "utf8");
  const personCount = (xml.match(/<person\b/g) ?? []).length;
  const personTripCount = (xml.match(/<personTrip\b/g) ?? []).length;

  let flowCount = 0;
  const personFlowRegex = /<personFlow\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = personFlowRegex.exec(xml)) !== null) {
    flowCount += estimateFlowCount(match[1] ?? "");
  }

  return personCount + personTripCount + flowCount;
}

function readSimulationDurationSeconds(sumocfgPath: string): number | null {
  if (!fs.existsSync(sumocfgPath)) return null;
  const xml = fs.readFileSync(sumocfgPath, "utf8");
  const endMatch = xml.match(/<end\s+value="([0-9.]+)"\s*\/?/i);
  if (!endMatch?.[1]) return null;
  const value = Number(endMatch[1]);
  return Number.isFinite(value) ? value : null;
}

function readSimulationDurationFromMainPy(mainPyPath: string): number | null {
  if (!fs.existsSync(mainPyPath)) return null;

  const source = fs.readFileSync(mainPyPath, "utf8");
  const match = source.match(/\bTOTAL_SIM\s*=\s*([0-9]+)/);
  if (!match?.[1]) return null;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function readDirectionAvailabilityFromNetFile(netPath: string): DirectionAvailability | null {
  if (!fs.existsSync(netPath)) return null;

  const xml = fs.readFileSync(netPath, "utf8");
  const edgeIdRegex = /<edge\b[^>]*\bid="([^"]+)"[^>]*>/gi;
  const edgeIds = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = edgeIdRegex.exec(xml)) !== null) {
    const edgeId = String(match[1] ?? "").trim();
    if (!edgeId || edgeId.startsWith(":")) continue;
    edgeIds.add(edgeId);
  }

  if (edgeIds.size === 0) return null;

  return {
    north: edgeIds.has("N2C"),
    south: edgeIds.has("S2C"),
    east: edgeIds.has("E2C"),
    west: edgeIds.has("W2C"),
  };
}

export async function GET() {
  try {
    const root = resolveWorkspaceRoot();
    const resultsDir = path.join(root, "sys_output");
    const logsDir = path.join(resultsDir, "logs");
    const tempPlotsDir = path.join(resultsDir, "temp_plots");
    const plotsDir = path.join(resultsDir, "plots");
    const dashboardDataDir = path.join(resultsDir, "dashboard_data");
    const sumoConfigDir = path.join(root, "sumo_config");
    const mainPyPath = path.join(root, "sim_unit", "core", "main.py");

    const summaryRows: CsvRow[] = [];
    const emissionRows: CsvRow[] = [];

    const routeVehicleStats = countVehiclesFromRoutes(path.join(sumoConfigDir, "routes.rou.xml"));
    const flowVehicleStats = countVehiclesFromFlows(path.join(sumoConfigDir, "flows.rou.xml"));
    const vehicleStats = mergeVehicleStats(routeVehicleStats, flowVehicleStats);
    const pedestrianCount = countPedestriansFromRoutes(path.join(sumoConfigDir, "p_routes.rou.xml"));
    const latestInfo = readJsonFileSafe<{
      latest_run_folder?: string;
      wall_clock_start?: string;
      wall_clock_end?: string;
      scenario_start?: string;
      scenario_end?: string;
      run_type?: string;
      optimization_goal?: string;
      base_config_optimized?: string;
    }>(path.join(dashboardDataDir, "latest.json"));

    const latestRunFolder = latestInfo?.latest_run_folder?.trim();

    const simulationDurationSec = latestRunFolder ? (
      readSimulationDurationSeconds(path.join(sumoConfigDir, "my.sumocfg")) ??
      readSimulationDurationFromMainPy(mainPyPath)
    ) : 0;
    const wallClockStart = latestInfo?.wall_clock_start || null;
    const wallClockEnd = latestInfo?.wall_clock_end || null;
    const scenarioStart = latestInfo?.scenario_start || null;
    let scenarioEnd = latestInfo?.scenario_end || null;

    if (!scenarioEnd && scenarioStart && simulationDurationSec) {
      try {
        scenarioEnd = new Date(new Date(scenarioStart).getTime() + simulationDurationSec * 1000).toISOString();
      } catch (e) {
        console.error("Failed to calculate scenarioEnd fallback:", e);
      }
    }

    const historyByMode =
      (latestRunFolder
        ? readJsonFileSafe<HistoryByMode>(
          path.join(dashboardDataDir, latestRunFolder, "history_by_mode.json")
        )
        : null) ?? {};
    const dashboardSummaryRows =
      (latestRunFolder
        ? readJsonFileSafe<DashboardSummaryRow[]>(
          path.join(dashboardDataDir, latestRunFolder, "summary.json")
        )
        : null) ?? null;
    const congestionByConfig = buildCongestionSummary(historyByMode, dashboardSummaryRows);
    const summaryVehicleTotal = deriveVehicleTotalFromSummaryRows(summaryRows);
    const dashboardSummaryVehicleTotal =
      deriveVehicleTotalFromDashboardSummary(dashboardSummaryRows);
    const dashboardVehicleTypes = deriveVehicleTypesFromDashboardSummary(dashboardSummaryRows);
    const summaryPedestrianTotal = derivePedestrianTotalFromSummaryRows(summaryRows);
    const dashboardSummaryPedestrianTotal =
      derivePedestrianTotalFromDashboardSummary(dashboardSummaryRows);
    const historyPedestrianTotal = derivePedestrianTotalFromHistory(historyByMode);
    const signalTimingByConfig = buildSignalTimingByConfig(
      dashboardSummaryRows,
      historyByMode,
      scenarioStart
    );
    const directionAvailability =
      readDirectionAvailabilityFromNetFile(path.join(sumoConfigDir, "my.net.xml")) ?? null;
    const networkLayoutSummary: Section4NetworkLayoutSummary =
      buildNetworkLayoutSummary(directionAvailability);

    const summaryPayload: Section4NetworkLayoutSummary = {
      generatedAt: new Date().toISOString(),
      sourceFile: path.join(sumoConfigDir, "my.net.xml"),
      ...networkLayoutSummary,
    };

    if (latestRunFolder) {
      const summaryForLatestRun = path.join(
        dashboardDataDir,
        latestRunFolder,
        "network_layout_summary.json"
      );
      const summaryForGlobal = path.join(dashboardDataDir, "network_layout_summary.json");

      fs.mkdirSync(path.dirname(summaryForLatestRun), { recursive: true });
      fs.writeFileSync(summaryForLatestRun, JSON.stringify(summaryPayload, null, 2), "utf8");
      fs.writeFileSync(summaryForGlobal, JSON.stringify(summaryPayload, null, 2), "utf8");
    }

    const resolvedPedestrianTotal = latestRunFolder ? resolvePedestrianTotal([
      dashboardSummaryPedestrianTotal,
      summaryPedestrianTotal,
      historyPedestrianTotal,
      pedestrianCount,
    ]) : 0;
    const resolvedVehicleTotal = latestRunFolder ? resolveVehicleTotal([
      dashboardSummaryVehicleTotal,
      summaryVehicleTotal,
      vehicleStats.total,
    ]) : 0;

    const absolutePath = path.resolve(resultsDir);

    return NextResponse.json({
      status: "success",
      timestamp: latestRunFolder ?? undefined,
      runType: latestInfo?.run_type ?? "simulation",
      optimizationGoal: latestInfo?.optimization_goal ?? "N/A",
      baseConfigOptimized: latestInfo?.base_config_optimized ?? "N/A",
      source: {
        resultsDir,
        sumoConfigDir,
        absolutePath,
        debug: `Data source: ${absolutePath}`,
      },
      wallClockStart,
      wallClockEnd,
      scenarioStart,
      scenarioEnd,
      simulationStartDateTime: scenarioStart, 
      simulationEndDateTime: scenarioEnd,     
      section1: {
        totalVehicles: resolvedVehicleTotal,
        vehicleTypes: (() => {
          if (dashboardVehicleTypes.length > 0) return dashboardVehicleTypes;
          if (resolvedVehicleTotal <= 0) return [];

          const xmlTypes = vehicleStats.byType;
          if (xmlTypes.length === 0) return xmlTypes;

          const xmlTotal = vehicleStats.total;
          if (xmlTotal <= 0) return xmlTypes;

          const ratio = resolvedVehicleTotal / xmlTotal;
          return xmlTypes.map(t => ({
            type: t.type,
            count: Math.max(1, Math.round(t.count * ratio))
          })).sort((a, b) => b.count - a.count);
        })(),
        totalPedestrians: resolvedPedestrianTotal,
        simulationDurationSec,
      },
      section2: {
        summaryStats: (dashboardSummaryRows as unknown as CsvRow[]) ?? [],
        tempPlots: readFilesByPattern(tempPlotsDir, /\.(png|jpg|jpeg|svg|webp)$/i),
      },
      section3: {
        emissionsSummary: (dashboardSummaryRows as unknown as CsvRow[]) ?? [],
        plots: readFilesByPattern(plotsDir, /\.(png|jpg|jpeg|svg|webp)$/i),
      },
      section4: {
        signalTimingByConfig,
        congestionByConfig,
        networkLayoutSummary: summaryPayload,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to read simulation data",
      },
      { status: 500 }
    );
  }
}
