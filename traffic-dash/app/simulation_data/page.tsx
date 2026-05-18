"use client";

import Link from "next/link";
import ThemeToggle from "../_components/ThemeToggle";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Label,
} from "recharts";
import {
  buildNetworkLayoutSummary,
  type DirectionAvailability,
} from "../_lib/network-layout-summary";
import {
  UNAVAILABLE_BADGE_CLASS,
  UNAVAILABLE_LABEL,
  UNAVAILABLE_VISUAL_CLASS,
} from "../_lib/unavailable-ui";

type VehicleTypeCount = {
  type: string;
  count: number;
};

type SummaryRow = {
  Configuration: string;
  "User Class": string;
  "Average Delay (s)": string;
  "Max Delay (s)": string;
  "Avg Delay Per Vehicle (s)": string;
  "Avg Delay Per Pedestrian (s)": string;
  "Starvation Events": string;
  "Steady-State Delay (s)"?: string;
  "Steady-State Experience (s)"?: string;
  "Steady-State Max (s)"?: string;
  "P95 Delay Proxy (s)"?: string;
  "P99 Delay Proxy (s)"?: string;
};

type EmissionRow = {
  Configuration: string;
  Category: string;
  Count: string;
  "Avg CO2 (g)": string;
  "Avg Fuel (g)": string;
  "Total CO2 (g)": string;
  "Total Fuel (g)": string;
};

type ApiPayload = {
  status: "success" | "error";
  message?: string;
  simulationStartDateTime?: string | null;
  simulationEndDateTime?: string | null;
  runType?: string;
  optimizationGoal?: string;
  baseConfigOptimized?: string;
  section1?: {
    totalVehicles: number;
    vehicleTypes: VehicleTypeCount[];
    totalPedestrians: number;
    simulationDurationSec?: number | null;
  };
  section2?: {
    summaryStats: SummaryRow[];
    tempPlots: string[];
  };
  section3?: {
    emissionsSummary: EmissionRow[];
    plots: string[];
  };
  section4?: {
    signalTimingByConfig?: Array<{
      config: string;
      simulationStartDateTime?: string | null;
      ns: {
        simulationStartDateTime?: string | null;
        greenToRedChanges: number;
        durations: {
          green: { min: number; max: number; avg: number };
          yellow: { min: number; max: number; avg: number };
          red: { min: number; max: number; avg: number };
        };
      };
      ew: {
        simulationStartDateTime?: string | null;
        greenToRedChanges: number;
        durations: {
          green: { min: number; max: number; avg: number };
          yellow: { min: number; max: number; avg: number };
          red: { min: number; max: number; avg: number };
        };
      };
    }>;
    congestionByConfig: Array<{
      config: string;
      avgNsQueue: number;
      avgEwQueue: number;
      avgTotalQueue: number;
      peakTotalQueue: number;
      congestionLevel: number;
      avgCongestionIntensity: number;
      avgCongestionIntensityDemand: number;
      starvationEvents: number;
      throughput: number;
      preemptionEvents: number;
      samples: number;
      stabilizationTime: number;
    }>;
    networkLayoutSummary?: {
      directionAvailability?: DirectionAvailability;
      nsAxis?: boolean;
      ewAxis?: boolean;
      availableDirections?: string[];
      missingDirections?: string[];
      hasAnyDirection?: boolean;
    };
  };
};

const PIE_COLORS = ["#0ea5e9", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

function toTitleFromConfig(raw: string): string {
  if (!raw) return "Unknown";
  return raw
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function formatDurationValue(value: number): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0s";
  const rounded = Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1);
  return `${rounded}s`;
}

function formatDateTimeLabel(value?: string | null): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString([], { timeZone: 'UTC' });
}

function deriveSimulationEnd(start?: string | null, durationSec?: number | null): string {
  if (!start || !Number.isFinite(Number(durationSec)) || Number(durationSec) <= 0) return "Unknown";
  const startDate = new Date(start);
  if (!Number.isFinite(startDate.getTime())) return "Unknown";
  const endMs = startDate.getTime() + Number(durationSec) * 1000;
  return new Date(endMs).toLocaleString();
}

function toRangeBar(
  minValue: number,
  maxValue: number,
  avgValue: number,
  reference: number
): { left: string; width: string; avgLeft: string } {
  const safeRef = Math.max(reference, 1);
  const safeMin = Math.max(0, Number(minValue ?? 0));
  const safeMax = Math.max(safeMin, Number(maxValue ?? 0));
  const safeAvg = Math.max(safeMin, Math.min(safeMax, Number(avgValue ?? safeMin)));

  const leftPct = (safeMin / safeRef) * 100;
  const widthPct = Math.max(2, ((safeMax - safeMin) / safeRef) * 100);
  const avgLeftPct = (safeAvg / safeRef) * 100;

  return {
    left: `${leftPct}%`,
    width: `${widthPct}%`,
    avgLeft: `${avgLeftPct}%`,
  };
}

const CustomPercentLabel = (props: any) => {
  const { x, y, width, value, invertColor, showPercentages } = props;
  if (showPercentages === false) return null;
  if (value === undefined || value === null || value === "") return null;

  const strValue = String(value);
  const isPositive = strValue.startsWith("+");
  const isNegative = strValue.startsWith("-");

  let fill = "#475569"; 

  if (isPositive) fill = invertColor ? "#22c55e" : "#ef4444";
  if (isNegative) fill = invertColor ? "#ef4444" : "#22c55e";

  return (
    <text
      x={(x || 0) + (width || 0) / 2}
      y={(y || 0) - 10}
      fill={fill}
      fontSize={20}
      fontWeight="900"
      textAnchor="middle"
    >
      {strValue}
    </text>
  );
};

const CustomCongestionTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <p className="font-bold text-slate-800 dark:text-slate-100">{label}</p>
        <div className="mt-2 space-y-1 text-xs">
          <p className="flex justify-between gap-4">
            <span className="text-slate-500">Congestion Index:</span>
            <span className="font-mono font-bold text-orange-500">{data.congestionLevel.toFixed(2)}</span>
          </p>
          <p className="flex justify-between gap-4 border-t border-slate-100 pt-1 dark:border-slate-800">
            <span className="text-slate-500">Avg Total Queue:</span>
            <span className="font-mono text-sky-500">{data.avgTotalQueue.toFixed(2)} cars</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="text-slate-500">Peak Total Queue:</span>
            <span className="font-mono text-rose-500">{data.peakTotalQueue} cars</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="text-slate-500">Starvation Events:</span>
            <span className="font-mono text-amber-500">{data.starvationEvents} events</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="text-slate-500">Preemption Events:</span>
            <span className="font-mono text-emerald-500">{data.preemptionEvents} events</span>
          </p>
          <p className="flex justify-between gap-4 border-t border-slate-100 pt-1 dark:border-slate-800">
            <span className="text-slate-500">Stabilized At:</span>
            <span className="font-mono text-fuchsia-500 font-bold">{data.stabilizationTime > 0 ? `${data.stabilizationTime}s` : "N/A"}</span>
          </p>
          <p className="flex justify-between gap-4 border-t border-slate-100 pt-1 dark:border-slate-800">
            <span className="text-slate-500">Throughput:</span>
            <span className="font-mono text-indigo-500 font-bold">{data.throughput} veh</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

const getApexWinnerForGoal = (gKey: string, configurations: Record<string, any>): string => {
  if (gKey === "baseline") return "fixed_no_preempt";
  const keys = Object.keys(configurations).filter(k => k !== "fixed_no_preempt" && k !== "fixed_with_preempt");
  if (keys.length === 0) return "adaptive_weighted_with_preempt";

  const baseCfg = configurations.fixed_no_preempt || {};
  const baseVeh = baseCfg.vehicle || {};
  const baseEv = baseCfg.emergency || {};
  const basePt = baseCfg.pt_bus || {};
  const basePed = baseCfg.pedestrian || {};

  const baseThru = baseVeh.throughput ?? baseVeh.Count ?? baseVeh['Total Vehicles'] ?? 240;
  const baseVehAvg = baseVeh['Average Delay (s)'] || 25;
  const baseEvAvg = baseEv['Average Delay (s)'] ?? baseVeh.ev_avg ?? 15;
  const basePtAvg = basePt['Average Delay (s)'] ?? baseVeh.pt_avg ?? 35;
  const basePedAvg = basePed['Average Delay (s)'] ?? baseVeh.p_avg ?? 15;
  const baseCO2 = baseVeh['Avg CO2 (g)'] || 85;
  const baseFuel = baseVeh['Avg Fuel (g)'] || 27.5;
  const baseCong = baseVeh['Avg Congestion Level'] ?? baseVeh.congestion_level ?? 0.18;
  const baseStops = baseVeh['Total Stops'] ?? baseVeh.total_vehicle_stops ?? 115;
  const baseAvgQueue = baseVeh['Average Queue Length'] ?? baseVeh.avg_queue ?? 5.0;
  const baseSwitches = baseVeh['NS Green->Red Changes'] ?? baseVeh.light_changes ?? 8;

  let bestKey = keys[0];
  let bestScore = Infinity;

  for (const key of keys) {
    const cData = configurations[key] || {};
    const veh = cData.vehicle || {};
    const ev = cData.emergency || {};
    const pt = cData.pt_bus || {};
    const ped = cData.pedestrian || {};

    const curThru = veh.throughput ?? veh.Count ?? veh['Total Vehicles'] ?? 0;
    const vehAvg = veh['Average Delay (s)'] || 0;
    const evAvg = ev['Average Delay (s)'] ?? veh.ev_avg ?? 0;
    const ptAvg = pt['Average Delay (s)'] ?? veh.pt_avg ?? 0;
    const pedAvg = ped['Average Delay (s)'] ?? veh.p_avg ?? 0;

    const vehP95 = veh['P95 Delay Proxy (s)'] ?? veh.veh_p95 ?? veh.reg_v_p95 ?? vehAvg;
    const evP95 = ev['P95 Delay Proxy (s)'] ?? ev.ev_p95 ?? veh.ev_p95 ?? evAvg;
    const pedP95 = ped['P95 Delay Proxy (s)'] ?? ped.ped_p95 ?? veh.ped_p95 ?? pedAvg;

    const starv = veh['Starvation Events'] ?? 0;
    const co2 = veh['Avg CO2 (g)'] || 0;
    const fuel = veh['Avg Fuel (g)'] || 0;
    const stops = veh['Total Stops'] ?? veh.total_vehicle_stops ?? 0;
    const avgQueue = veh['Average Queue Length'] ?? veh.avg_queue ?? 0;
    const timeLoss = veh['avg_time_loss'] ?? veh.time_loss ?? 0;
    const switches = veh['NS Green->Red Changes'] ?? veh.light_changes ?? 0;
    const forceSwitches = veh['preemption_force_switches'] ?? veh.force_switches ?? 0;
    const holds = veh['preemption_holds'] ?? veh.holds ?? 0;

    const congLevel = veh['Avg Congestion Level'] ?? veh.congestion_level ?? 0;
    const recoveryRatio = veh['Recovery Active Ratio'] ?? veh.recovery_time_ratio ?? 0;
    const laneUtil = veh['Avg Lane Utilization'] ?? veh.lane_utilization ?? 0;
    const queueTrend = veh['Queue Trend'] ?? veh.queue_trend ?? 1.0;
    const delayTrend = veh['Delay Trend'] ?? veh.delay_trend ?? 1.0;
    const sliceVariance = veh['Slice Variance'] ?? veh.slice_variance ?? 0;

    const ratio = (val: number, base: number) => base <= 0 ? val : val / base;

    const weights: Record<string, number> = {
      all_v_avg: 5.0, ev_avg: 2.5, pt_avg: 2.0, p_avg: 2.5,
      ev_p95: 1.5, ped_p95: 2.0, starvation_events: 4.0,
      total_co2: 3.0, total_fuel: 1.5, total_stops: 4.0,
      avg_queue: 2.5, time_loss: 1.5, throughput: 5.0,
      light_changes: 1.5, force_switches: 2.0, preemption_holds: 2.0,
      fluidity_ratio: 4.0, congestion_level: 3.0, recovery_time_ratio: 3.0,
      lane_utilization: 2.0, queue_trend: 4.0, delay_trend: 3.0, slice_variance: 3.0
    };

    if (gKey === "eco") {
      weights.total_co2 *= 25.0; weights.total_fuel *= 15.0; weights.total_stops *= 10.0; weights.avg_queue *= 1.5; weights.all_v_avg *= 0.5;
    } else if (gKey === "throughput") {
      weights.throughput *= 25.0; weights.all_v_avg *= 2.0; weights.avg_queue *= 2.0; weights.time_loss *= 2.0; weights.total_stops *= 0.2;
    } else if (gKey === "ev_focus") {
      weights.ev_avg *= 25.0; weights.ev_p95 *= 15.0; weights.force_switches *= 2.0; weights.light_changes *= 1.5;
    } else if (gKey === "ped_focus") {
      weights.ped_p95 *= 25.0; weights.p_avg *= 20.0; weights.starvation_events *= 3.0;
    } else if (gKey === "fluidity") {
      weights.total_stops *= 15.0; weights.throughput *= 15.0; weights.all_v_avg *= 1.5; weights.avg_queue *= 1.5; weights.time_loss *= 1.5; weights.total_co2 *= 0.5;
    } else if (gKey === "low_congestion") {
      weights.congestion_level *= 25.0; weights.avg_queue *= 5.0; weights.lane_utilization *= 3.0; weights.recovery_time_ratio *= 2.0;
    } else if (gKey === "veh_focus") {
      weights.all_v_avg *= 25.0; weights.time_loss *= 2.0; weights.avg_queue *= 2.0;
    } else if (gKey === "ped_veh_focus") {
      weights.ped_p95 *= 20.0; weights.p_avg *= 18.0; weights.starvation_events *= 3.0; weights.all_v_avg *= 20.0; weights.time_loss *= 2.0; weights.avg_queue *= 2.0;
    }

    const thruRatio = curThru > 0 ? (baseThru / curThru) : 2.0; 
    const holdsRatio = ((baseVeh['preemption_holds'] ?? 0) + 1.0) / (holds + 1.0);

    const curFluidity = stops > 0 ? (curThru / stops) : curThru;
    const baseFluidity = baseStops > 0 ? (baseThru / baseStops) : baseThru;
    const fluidityRatio = (baseFluidity + 0.1) / (curFluidity + 0.1);

    const objectiveScore = (
      weights.all_v_avg * ratio(vehAvg, baseVehAvg)
      + weights.ev_avg * ratio(evAvg, baseEvAvg)
      + weights.pt_avg * ratio(ptAvg, basePtAvg)
      + weights.p_avg * ratio(pedAvg, basePedAvg)
      + weights.ev_p95 * ratio(evP95, baseEvAvg)
      + weights.ped_p95 * ratio(pedP95, basePedAvg)
      + weights.starvation_events * ratio(starv, 0.1)
      + weights.total_co2 * ratio(co2, baseCO2)
      + weights.total_fuel * ratio(fuel, baseFuel)
      + weights.total_stops * ratio(stops, baseStops)
      + weights.avg_queue * ratio(avgQueue, baseAvgQueue)
      + weights.time_loss * ratio(timeLoss, baseVeh['avg_time_loss'] ?? 10)
      + weights.throughput * thruRatio
      + weights.light_changes * ratio(switches, baseSwitches)
      + weights.force_switches * ratio(forceSwitches, 1.0)
      + weights.preemption_holds * holdsRatio
      + weights.fluidity_ratio * fluidityRatio
      + weights.congestion_level * ratio(congLevel, baseCong)
      + weights.recovery_time_ratio * ratio(recoveryRatio, 0.1)
      + weights.lane_utilization * ratio(laneUtil, 0.1)
      + weights.queue_trend * queueTrend
      + weights.delay_trend * delayTrend
      + weights.slice_variance * sliceVariance
    );

    if (objectiveScore < bestScore) {
      bestScore = objectiveScore;
      bestKey = key;
    }
  }

  return bestKey;
};

export default function SimulationDataPage() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryTimePeriod, setSummaryTimePeriod] = useState<"overall" | "stabilized">("overall");
  const [summaryMetric, setSummaryMetric] = useState<"avg" | "max" | "life">("avg");
  const categories = ["All Vehicles", "Vehicle", "Pedestrian", "Emergency", "PT (Bus)"];
  const [summaryClass, setSummaryClass] = useState<string>("All Vehicles");
  const [p95Class, setP95Class] = useState<string>("All Vehicles");
  const [emissionMetric, setEmissionMetric] = useState<"count" | "avgCO2" | "avgFuel" | "totalCO2" | "totalFuel">("avgCO2");
  const [emissionCategory, setEmissionCategory] = useState<string>("all");
  const [congestionMetric, setCongestionMetric] = useState<
    | "congestionLevel"
    | "avgTotalQueue"
    | "peakTotalQueue"
    | "avgNsQueue"
    | "avgEwQueue"
    | "starvationEvents"
    | "preemptionEvents"
    | "avgCongestionIntensity"
    | "avgCongestionIntensityDemand"
    | "throughput"
    | "stabilizationTime"
  >("avgCongestionIntensity");
  const [baselineConfig, setBaselineConfig] = useState<string>("Baseline Fixed No Preempt");
  const [matrixData, setMatrixData] = useState<any>(null);
  const [optConfigData, setOptConfigData] = useState<any>(null);
  const [displayFilterMode, setDisplayFilterMode] = useState<"all" | "winners">("all");
  const [showPercentages, setShowPercentages] = useState<boolean>(true);

  useEffect(() => {
    fetch("/api/simulation-data", { cache: "no-store" })
      .then((res) => res.json() as Promise<ApiPayload>)
      .then((payload) => {
        if (payload.status === "error") {
          setError(payload.message ?? "Failed to load simulation data.");
          return;
        }

        setData(payload);
      })
      .catch((err) => setError(err.message));

    fetch(`/api/simulation-dashboard/multi-goal-matrix?t=${Date.now()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setMatrixData(data);
        }
      })
      .catch((err) => console.error("Failed to load matrix data:", err));

    fetch(`/api/simulation-dashboard/optimization-config?t=${Date.now()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setOptConfigData(data);
        }
      })
      .catch((err) => console.error("Failed to load optimization config:", err));
  }, []);

  const winnerConfigNames = useMemo(() => {
    if (!matrixData?.goals) return new Set<string>();
    const winners = new Set<string>();
    winners.add("Baseline Fixed No Preempt");

    Object.keys(matrixData.goals).forEach((gKey) => {
      const gData = matrixData.goals[gKey];
      if (gData?.configurations) {
        const bestModeKey = getApexWinnerForGoal(gKey, gData.configurations);
        const bestConfigObj = gData.configurations[bestModeKey];
        const configName = bestConfigObj?.vehicle?.config ?? bestConfigObj?.vehicle?.Configuration;
        if (configName) {
          winners.add(configName);
        }
      }
    });
    return winners;
  }, [matrixData]);

  const pieData = useMemo(() => {
    const rows = data?.section1?.vehicleTypes ?? [];
    return rows.map((row) => ({ name: row.type, value: row.count }));
  }, [data]);

  const summaryRows = useMemo(() => data?.section2?.summaryStats ?? [], [data]);

  const orderedConfigs = useMemo(() => {
    const set = new Set<string>();
    summaryRows.forEach((row) => set.add(row.Configuration));
    return Array.from(set);
  }, [summaryRows]);

  const summaryClassOptions = useMemo(() => {
    const set = new Set<string>();
    summaryRows.forEach((row) => set.add(row["User Class"]));
    return Array.from(set);
  }, [summaryRows]);

  const effectiveSummaryClass =
    summaryClassOptions.includes(summaryClass) && summaryClass
      ? summaryClass
      : (summaryClassOptions[0] ?? "");

  const summaryChartData = useMemo(() => {
    const filtered = summaryRows.filter((row) => row["User Class"] === effectiveSummaryClass);
    const baseRow = filtered.find(r => r.Configuration.toLowerCase().trim() === baselineConfig.toLowerCase().trim())
      ?? filtered.find(r => r.Configuration.toLowerCase().trim().endsWith(baselineConfig.toLowerCase().trim()))
      ?? filtered[0];
    const baseAvg = baseRow ? Number(baseRow["Average Delay (s)"] ?? 0) : null;
    const baseMax = baseRow ? Number(baseRow["Max Delay (s)"] ?? 0) : null;
    const baseLife = baseRow ? Number(baseRow["Avg Delay Per Vehicle (s)"] ?? baseRow["Avg Delay Per Pedestrian (s)"] ?? 0) : null;
    const baseStarvation = baseRow ? Number(baseRow["Starvation Events"] ?? 0) : null;

    let finalFiltered = filtered;
    if (displayFilterMode === "winners" && winnerConfigNames.size > 0) {
      finalFiltered = filtered.filter(r => winnerConfigNames.has(r.Configuration));
    }

    return finalFiltered.map((row) => {
      const avg = Number(row["Average Delay (s)"] ?? 0);
      const max = Number(row["Max Delay (s)"] ?? 0);
      const life = Number(row["Avg Delay Per Vehicle (s)"] ?? row["Avg Delay Per Pedestrian (s)"] ?? 0);
      const steady = Number(row["Steady-State Delay (s)"] ?? 0);
      const steadyLife = Number(row["Steady-State Experience (s)"] ?? 0);
      const steadyMax = Number(row["Steady-State Max (s)"] ?? 0);
      const starvation = Number(row["Starvation Events"] ?? 0);

      const calcPct = (curr: number, base: number | null, unit = "") => {
        if (base === null) return "";
        if (base === 0) {
          if (curr === 0) return "0%";
          return `+${curr}${unit}`;
        }
        const diff = ((curr - base) / base) * 100;
        return (diff >= 0 ? "+" : "") + diff.toFixed(2) + "%";
      };

      return {
        config: row.Configuration,
        displayConfig: toTitleFromConfig(row.Configuration),
        avg,
        max,
        life,
        starvation,
        steady,
        steadyLife,
        steadyMax,
        pctDiffStrAvg: calcPct(avg, baseAvg),
        pctDiffStrMax: calcPct(max, baseMax),
        pctDiffStrLife: calcPct(life, baseLife),
        pctDiffStrSteady: calcPct(steady, Number(baseRow?.["Steady-State Delay (s)"] ?? 0)),
        pctDiffStrSteadyLife: calcPct(steadyLife, Number(baseRow?.["Steady-State Experience (s)"] ?? 0)),
        pctDiffStrSteadyMax: calcPct(steadyMax, Number(baseRow?.["Steady-State Max (s)"] ?? 0)),
        pctDiffStrStarvation: calcPct(starvation, baseStarvation, " events"),
      };
    });
  }, [summaryRows, effectiveSummaryClass, summaryTimePeriod, summaryMetric, baselineConfig, displayFilterMode, winnerConfigNames]);

  const effectiveP95Class =
    summaryClassOptions.includes(p95Class) && p95Class
      ? p95Class
      : (summaryClassOptions[0] ?? "");

  const p95ChartData = useMemo(() => {
    const filtered = summaryRows.filter((row) => row["User Class"] === effectiveP95Class);
    const baseRow = filtered.find(r => r.Configuration.toLowerCase().trim() === baselineConfig.toLowerCase().trim())
      ?? filtered.find(r => r.Configuration.toLowerCase().trim().endsWith(baselineConfig.toLowerCase().trim()))
      ?? filtered[0];
    const baseP95 = baseRow ? Number(baseRow["P95 Delay Proxy (s)"] ?? 0) : null;
    const baseP99 = baseRow ? Number(baseRow["P99 Delay Proxy (s)"] ?? 0) : null;

    let finalFiltered = filtered;
    if (displayFilterMode === "winners" && winnerConfigNames.size > 0) {
      finalFiltered = filtered.filter(r => winnerConfigNames.has(r.Configuration));
    }

    return finalFiltered.map((row) => {
      const p95 = Number(row["P95 Delay Proxy (s)"] ?? 0);
      const p99 = Number(row["P99 Delay Proxy (s)"] ?? 0);

      const calcPct = (curr: number, base: number | null) => {
        if (base === null) return "";
        if (base === 0) {
          if (curr === 0) return "0%";
          return `+${curr}s`;
        }
        const diff = ((curr - base) / base) * 100;
        return (diff >= 0 ? "+" : "") + diff.toFixed(2) + "%";
      };

      return {
        config: row.Configuration,
        displayConfig: toTitleFromConfig(row.Configuration),
        p95,
        p99,
        pctDiffStrP95: calcPct(p95, baseP95),
        pctDiffStrP99: calcPct(p99, baseP99),
      };
    });
  }, [summaryRows, effectiveP95Class, baselineConfig, displayFilterMode, winnerConfigNames]);

  const emissionsRows = useMemo(() => {
    const all = data?.section3?.emissionsSummary ?? [];
    const dedup = new Map<string, EmissionRow>();
    all.forEach((row) => {
      const key = `${row.Configuration}__${row.Category}`;
      dedup.set(key, row);
    });
    return Array.from(dedup.values());
  }, [data]);

  const emissionCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    emissionsRows.forEach((row) => set.add(row.Category));
    return Array.from(set).filter((cat) => cat !== "Pedestrian");
  }, [emissionsRows]);

  const effectiveEmissionCategory =
    emissionCategoryOptions.includes(emissionCategory) && emissionCategory
      ? emissionCategory
      : (emissionCategoryOptions[0] ?? "");

  const emissionChartData = useMemo(() => {
    const filtered = emissionsRows.filter((row) => row.Category === effectiveEmissionCategory);
    const baseRow = filtered.find(r => r.Configuration.toLowerCase().trim() === baselineConfig.toLowerCase().trim())
      ?? filtered.find(r => r.Configuration.toLowerCase().trim().endsWith(baselineConfig.toLowerCase().trim()))
      ?? filtered[0];
    const getBase = (key: keyof EmissionRow) => baseRow ? Number(baseRow[key] ?? 0) : null;

    let finalFiltered = filtered;
    if (displayFilterMode === "winners" && winnerConfigNames.size > 0) {
      finalFiltered = filtered.filter(r => winnerConfigNames.has(r.Configuration));
    }

    return finalFiltered.map((row) => {
      const count = Number(row.Count ?? 0);
      const avgCO2 = Number(row["Avg CO2 (g)"] ?? 0);
      const avgFuel = Number(row["Avg Fuel (g)"] ?? 0);
      const totalCO2 = Number(row["Total CO2 (g)"] ?? 0) / 1000.0;
      const totalFuel = Number(row["Total Fuel (g)"] ?? 0) / 1000.0;

      const calcPct = (curr: number, base: number | null, unit = "") => {
        if (base === null) return "";
        if (base === 0) {
          if (curr === 0) return "0%";
          return `+${curr}${unit}`;
        }
        const diff = ((curr - base) / base) * 100;
        return (diff >= 0 ? "+" : "") + diff.toFixed(2) + "%";
      };

      return {
        config: toTitleFromConfig(row.Configuration),
        count,
        avgCO2,
        avgFuel,
        totalCO2,
        totalFuel,
        pctDiffStrCount: calcPct(count, getBase("Count")),
        pctDiffStrAvgCO2: calcPct(avgCO2, getBase("Avg CO2 (g)")),
        pctDiffStrAvgFuel: calcPct(avgFuel, getBase("Avg Fuel (g)")),
        pctDiffStrTotalCO2: calcPct(totalCO2, getBase("Total CO2 (g)") ? Number(getBase("Total CO2 (g)")) / 1000.0 : null),
        pctDiffStrTotalFuel: calcPct(totalFuel, getBase("Total Fuel (g)") ? Number(getBase("Total Fuel (g)")) / 1000.0 : null),
      };
    });
  }, [emissionsRows, effectiveEmissionCategory, baselineConfig, displayFilterMode, winnerConfigNames]);

  const summaryValueKey =
    summaryTimePeriod === "overall" ? (
      summaryMetric === "avg" ? "avg" :
        summaryMetric === "max" ? "max" : "life"
    ) : (
      summaryMetric === "avg" ? "steady" :
        summaryMetric === "max" ? "steadyMax" : "steadyLife"
    );

  const summaryPctDiffKey =
    summaryTimePeriod === "overall" ? (
      summaryMetric === "avg" ? "pctDiffStrAvg" :
        summaryMetric === "max" ? "pctDiffStrMax" : "pctDiffStrLife"
    ) : (
      summaryMetric === "avg" ? "pctDiffStrSteady" :
        summaryMetric === "max" ? "pctDiffStrSteadyMax" : "pctDiffStrSteadyLife"
    );

  const summaryValueLabel =
    (summaryMetric === "avg" ? "Average Delay (s)" :
      summaryMetric === "max" ? "Maximum Delay (s)" : "Individual Experience (s)") +
    (summaryTimePeriod === "stabilized" ? " [Post-Warmup]" : " [Overall]");

  const emissionValueLabel =
    emissionMetric === "count"
      ? "Count"
      : emissionMetric === "avgCO2"
        ? "Avg CO2 (g)"
        : emissionMetric === "avgFuel"
          ? "Avg Fuel (g)"
          : emissionMetric === "totalCO2"
            ? "Total CO2 (kg)"
            : "Total Fuel (kg)";

  const congestionChartData = useMemo(() => {
    const dataRows = data?.section4?.congestionByConfig ?? [];
    const baseRow = dataRows.find(r => r.config.toLowerCase().trim() === baselineConfig.toLowerCase().trim())
      ?? dataRows.find(r => r.config.toLowerCase().trim().endsWith(baselineConfig.toLowerCase().trim()))
      ?? dataRows[0];

    const calcPct = (curr: number, base: number | undefined, unit = "") => {
      if (base === undefined || base === null) return "";
      if (base === 0) {
        if (curr === 0) return "0%";
        return `+${curr}${unit}`;
      }
      const diff = ((curr - base) / base) * 100;
      return (diff >= 0 ? "+" : "") + diff.toFixed(2) + "%";
    };

    const sortedRows = [...dataRows].sort((a, b) => {
      const idxA = orderedConfigs.indexOf(a.config);
      const idxB = orderedConfigs.indexOf(b.config);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    let finalRows = sortedRows;
    if (displayFilterMode === "winners" && winnerConfigNames.size > 0) {
      finalRows = sortedRows.filter(r => winnerConfigNames.has(r.config));
    }

    return finalRows.map((row) => ({
      ...row,
      displayConfig: toTitleFromConfig(row.config),
      stabilizationTimeStr: row.stabilizationTime > 0 ? `${row.stabilizationTime}s` : "N/A",
      pctDiffStrCongestionLevel: calcPct(row.congestionLevel, baseRow?.congestionLevel),
      pctDiffStrAvgTotalQueue: calcPct(row.avgTotalQueue, baseRow?.avgTotalQueue),
      pctDiffStrAvgCongestionIntensity: calcPct(row.avgCongestionIntensity, baseRow?.avgCongestionIntensity),
      pctDiffStrAvgCongestionIntensityDemand: calcPct(row.avgCongestionIntensityDemand, baseRow?.avgCongestionIntensityDemand),
      pctDiffStrPeakTotalQueue: calcPct(row.peakTotalQueue, baseRow?.peakTotalQueue),
      pctDiffStrAvgNsQueue: calcPct(row.avgNsQueue, baseRow?.avgNsQueue),
      pctDiffStrAvgEwQueue: calcPct(row.avgEwQueue, baseRow?.avgEwQueue),
      pctDiffStrStarvationEvents: calcPct(row.starvationEvents, baseRow?.starvationEvents, " events"),
      pctDiffStrPreemptionEvents: calcPct(row.preemptionEvents, baseRow?.preemptionEvents, " events"),
      pctDiffStrThroughput: calcPct(row.throughput, baseRow?.throughput, " veh"),
      pctDiffStrStabilizationTime: calcPct(row.stabilizationTime, baseRow?.stabilizationTime, "s"),
    }));
  }, [data, orderedConfigs, baselineConfig, displayFilterMode, winnerConfigNames]);

  const signalTimingRows = useMemo(() => {
    const rows = data?.section4?.signalTimingByConfig ?? [];
    if (displayFilterMode === "winners" && winnerConfigNames.size > 0) {
      return rows.filter((r: any) => winnerConfigNames.has(r.config));
    }
    return rows;
  }, [data, displayFilterMode, winnerConfigNames]);
  const networkLayoutSummary = useMemo(
    () => buildNetworkLayoutSummary(data?.section4?.networkLayoutSummary?.directionAvailability),
    [data?.section4?.networkLayoutSummary?.directionAvailability]
  );
  const signalStartLabel = data?.simulationStartDateTime || "N/A";
  const signalEndLabel = data?.simulationEndDateTime || "N/A";
  const signalTimingEmpty = signalTimingRows.length === 0;

  const congestionValueLabel =
    congestionMetric === "avgCongestionIntensity"
      ? "Avg Congestion Intensity (Spatial Q/30)"
      : congestionMetric === "avgCongestionIntensityDemand"
        ? "Avg Congestion Intensity (Demand Q/N_active)"
        : congestionMetric === "congestionLevel"
          ? "Congestion Index"
          : congestionMetric === "avgTotalQueue"
            ? "Average Total Queue"
            : congestionMetric === "peakTotalQueue"
              ? "Peak Total Queue"
              : congestionMetric === "avgNsQueue"
                ? "Average NS Queue"
                : congestionMetric === "avgEwQueue"
                  ? "Average EW Queue"
                  : congestionMetric === "starvationEvents"
                    ? "Starvation Events"
                    : congestionMetric === "preemptionEvents"
                      ? "Preemption Events"
                      : congestionMetric === "throughput"
                        ? "Throughput"
                        : congestionMetric === "stabilizationTime"
                          ? "Stabilization Time (s)"
                          : "Queue Length (veh)";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-200 font-sans selection:bg-sky-500/30 pb-24">

      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-pink-900/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-sky-900/10 blur-[100px] rounded-full" />
        <div className="absolute bottom-[10%] left-[20%] w-[30%] h-[30%] bg-purple-900/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-12 z-10 space-y-8">

        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-lg mb-12 xl:flex-row xl:items-center xl:justify-between backdrop-blur-xl">
          <div className="flex items-center gap-4 min-w-0">
            <div className="p-3 bg-gradient-to-br from-pink-500 via-purple-500 to-sky-600 rounded-2xl shadow-lg shadow-purple-500/30 text-white text-2xl font-bold flex items-center justify-center w-14 h-14 flex-shrink-0">
              📊
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight truncate">Simulation Data</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 font-medium truncate">summary statistics, and emission comparisons across modes.</p>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-2.5 items-center flex-shrink-0 overflow-x-auto py-1 max-w-full">
            <ThemeToggle />
            <Link href="/project_overview" className="inline-flex items-center rounded-xl border border-pink-300 dark:border-pink-800 bg-pink-50 dark:bg-pink-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-pink-800 dark:text-pink-300 transition hover:bg-pink-100 dark:hover:bg-pink-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              🚀 Project Overview
            </Link>
            <Link href="/simulation_dashboard" className="inline-flex items-center rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-sky-800 dark:text-sky-300 transition hover:bg-sky-100 dark:hover:bg-sky-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              🎛️ Control Hub
            </Link>
            <Link href="/traffic_charts" className="inline-flex items-center rounded-xl border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-indigo-800 dark:text-indigo-300 transition hover:bg-indigo-100 dark:hover:bg-indigo-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              📈 Traffic Charts
            </Link>
            <Link href="/system_help" className="inline-flex items-center rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-purple-800 dark:text-purple-300 transition hover:bg-purple-100 dark:hover:bg-purple-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              📚 System Help
            </Link>
          </div>
        </header>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</div>}

        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-none">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span>🎛️</span> Chart Comparison Controls
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Select the benchmark baseline and filter visible chart configurations
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {orderedConfigs.length > 20 && (
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm flex-1 sm:flex-initial justify-between sm:justify-start">
                  <span className="uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Display:</span>
                  <select
                    value={displayFilterMode}
                    onChange={(e) => setDisplayFilterMode(e.target.value as any)}
                    className="bg-transparent font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Show All Bars ({orderedConfigs.length})</option>
                    <option value="winners">Show Only Winner Bars</option>
                  </select>
                </label>
              )}
              <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-between sm:justify-start">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm flex-1 sm:flex-initial justify-between sm:justify-start min-w-[140px] max-w-[200px]">
                  <span className="uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Baseline:</span>
                  <select
                    value={baselineConfig}
                    onChange={(e) => setBaselineConfig(e.target.value)}
                    className="bg-transparent font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer truncate w-full"
                  >
                    {orderedConfigs.map((cfg) => (
                      <option key={cfg} value={cfg}>{toTitleFromConfig(cfg)}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setShowPercentages(!showPercentages)}
                  className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider border rounded-xl px-3 py-2 shadow-sm transition-all ${showPercentages
                      ? "bg-sky-50 dark:bg-sky-950/50 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}
                  title="Toggle percentage difference labels above chart bars"
                >
                  <span>{showPercentages ? "📊 Pct: On" : "📊 Pct: Off"}</span>
                </button>
              </div>
            </div>
          </div>

          {optConfigData && data?.runType && data.runType !== "simulation" && (optConfigData.optimized_profile || (optConfigData.optimized_profiles_by_goal && Object.keys(optConfigData.optimized_profiles_by_goal).length > 0)) && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              {orderedConfigs.length > 20 ? (
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span>🌟</span> Multi-Goal Matrix Winners (48-Mode Sweep)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {optConfigData?.optimized_profiles_by_goal && Object.entries(optConfigData.optimized_profiles_by_goal).map(([gKey, gProf]: [string, any]) => (
                      <div key={gKey} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-sky-500 dark:text-sky-400 uppercase tracking-wider">
                            {gKey.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate" title={gProf.name || gProf.base_config}>
                          {gProf.name || gProf.base_config || "Adaptive"}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono truncate" title={gProf.base_config}>
                          Base: {gProf.base_config || "adaptive_weighted_with_preempt"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🎯</span>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Optimization Goal</div>
                      <div className="text-sm font-bold text-sky-500 dark:text-sky-400 capitalize mt-0.5">
                        {(() => {
                          const match = optConfigData?.optimized_profiles_by_goal
                            ? Object.entries(optConfigData.optimized_profiles_by_goal).find(([k, v]: any) => v.timestamp === optConfigData?.optimized_profile?.timestamp || v.name === optConfigData?.optimized_profile?.name)
                            : null;
                          return match ? match[0].replace('_', ' ') : "Balanced";
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 border-l border-slate-200 dark:border-slate-700 pl-4">
                    <span className="text-xl">⚙️</span>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Base Config to Optimize</div>
                      <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">
                        {optConfigData?.optimized_profile?.base_config || "adaptive_weighted_with_preempt"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 border-l border-slate-200 dark:border-slate-700 pl-4">
                    <span className="text-xl">👑</span>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Winning Controller Config</div>
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                        {optConfigData?.optimized_profile?.name || optConfigData?.optimized_profile?.base_config || "adaptive_weighted_with_preempt"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-none">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Section 1: Demand Overview</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-200">Total Vehicles</p>
              <p className="mt-1 text-3xl font-bold text-slate-800 dark:text-slate-200">{data?.section1?.totalVehicles ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-200">Total Pedestrians</p>
              <p className="mt-1 text-3xl font-bold text-slate-800 dark:text-slate-200">{data?.section1?.totalPedestrians ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-200">Simulation Duration</p>
              <p className="mt-1 text-3xl font-bold text-slate-800 dark:text-slate-200">
                {data?.section1?.simulationDurationSec ?? 0}s
              </p>
            </div>
          </div>

          <div className="mt-6 h-[400px] min-h-[400px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={140}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => toNumber(v).toLocaleString()} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-slate-500 dark:text-slate-400">
                <p className="text-lg font-medium">No vehicle data available</p>
                <p className="text-sm">Run a simulation to see the breakdown of vehicle types.</p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-none">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Section 2: Summary Stats Comparison</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">User Class</span>
              <select value={effectiveSummaryClass} onChange={(e) => setSummaryClass(e.target.value)} className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
                {summaryClassOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Time Period</span>
              <select value={summaryTimePeriod} onChange={(e) => setSummaryTimePeriod(e.target.value as any)} className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
                <option value="overall">Overall (Total Run)</option>
                <option value="stabilized">Stabilized (Post-Warmup)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Metric</span>
              <select value={summaryMetric} onChange={(e) => setSummaryMetric(e.target.value as any)} className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
                <option value="avg">Average Delay</option>
                <option value="max">Maximum Delay</option>
                <option value="life">Individual Experience</option>
              </select>
            </label>
          </div>

          <div className="mt-6 h-[360px] min-h-[360px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={summaryChartData} margin={{ top: 25 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="displayConfig" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={90} />
                <YAxis>
                  <Label
                    value={(summaryMetric as string) === "starvation" ? "Event Count" : "Delay (s)"}
                    angle={-90}
                    position="insideLeft"
                    style={{ textAnchor: 'middle', fontSize: '11px', fill: '#64748b', fontWeight: 600 }}
                  />
                </YAxis>
                <Tooltip formatter={(value: any) => Number(value).toFixed(2)} />
                <Legend />
                <Bar dataKey={summaryValueKey} name={summaryValueLabel} fill="#0ea5e9" minPointSize={3}>
                  <LabelList
                    dataKey={summaryPctDiffKey}
                    content={(props) => <CustomPercentLabel {...props} showPercentages={showPercentages} />}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-none">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Section 2B: Percentile Delay Comparison (P95 vs P99)</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">User Class</span>
              <select value={effectiveP95Class} onChange={(e) => setP95Class(e.target.value)} className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
                {summaryClassOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 h-[360px] min-h-[360px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={p95ChartData} margin={{ top: 25 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="displayConfig" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={90} />
                <YAxis>
                  <Label
                    value="Percentile Delay (s)"
                    angle={-90}
                    position="insideLeft"
                    style={{ textAnchor: 'middle', fontSize: '11px', fill: '#64748b', fontWeight: 600 }}
                  />
                </YAxis>
                <Tooltip formatter={(value: any) => Number(value).toFixed(2)} />
                <Legend />
                <Bar dataKey="p95" name="95th Percentile Delay (s)" fill="#8b5cf6" minPointSize={3}>
                  <LabelList
                    dataKey="pctDiffStrP95"
                    content={(props) => <CustomPercentLabel {...props} showPercentages={showPercentages} />}
                  />
                </Bar>
                <Bar dataKey="p99" name="99th Percentile Delay (s)" fill="#ec4899" minPointSize={3}>
                  <LabelList
                    dataKey="pctDiffStrP99"
                    content={(props) => <CustomPercentLabel {...props} showPercentages={showPercentages} />}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-none">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Section 3: Emissions Comparison</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Category</span>
              <select value={effectiveEmissionCategory} onChange={(e) => setEmissionCategory(e.target.value)} className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
                {emissionCategoryOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Metric</span>
              <select value={emissionMetric} onChange={(e) => setEmissionMetric(e.target.value as "count" | "avgCO2" | "avgFuel" | "totalCO2" | "totalFuel")} className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
                <option value="avgCO2">Avg CO2</option>
                <option value="avgFuel">Avg Fuel</option>
                <option value="totalCO2">Total CO2</option>
                <option value="totalFuel">Total Fuel</option>
              </select>
            </label>
          </div>

          <div className="mt-6 h-[380px] min-h-[380px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={emissionChartData} margin={{ top: 25 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="config" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={90} />
                <YAxis>
                  <Label
                    value={
                      emissionMetric === "count" ? "Vehicle Count" :
                        (emissionMetric === "avgCO2" || emissionMetric === "totalCO2") ? `CO₂ Emissions (${emissionMetric.startsWith("total") ? "kg" : "g"})` : `Fuel Consumption (${emissionMetric.startsWith("total") ? "kg" : "g"})`
                    }
                    angle={-90}
                    position="insideLeft"
                    style={{ textAnchor: 'middle', fontSize: '11px', fill: '#64748b', fontWeight: 600 }}
                  />
                </YAxis>
                <Tooltip formatter={(value: any) => Number(value).toFixed(2)} />
                <Legend />
                <Bar dataKey={emissionMetric} name={emissionValueLabel} fill="#14b8a6" minPointSize={3}>
                  <LabelList dataKey={emissionMetric === "count" ? "pctDiffStrCount" : emissionMetric === "avgCO2" ? "pctDiffStrAvgCO2" : emissionMetric === "avgFuel" ? "pctDiffStrAvgFuel" : emissionMetric === "totalCO2" ? "pctDiffStrTotalCO2" : "pctDiffStrTotalFuel"} content={(props) => <CustomPercentLabel {...props} showPercentages={showPercentages} />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-none">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Section 4: Traffic Pressure & Saturation</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Metric</span>
              <select value={congestionMetric} onChange={(e) => setCongestionMetric(e.target.value as any)} className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
                <option value="avgCongestionIntensity">Average Congestion Intensity (Spatial Q/30)</option>
                <option value="avgCongestionIntensityDemand">Average Congestion Intensity (Demand Q/N_active)</option>
                <option value="avgTotalQueue">Average Queue Length (Cars)</option>
                <option value="peakTotalQueue">Peak Total Queue</option>
                <option value="avgNsQueue">Average NS Queue</option>
                <option value="avgEwQueue">Average EW Queue</option>
                <option value="starvationEvents">Starvation Events</option>
                <option value="preemptionEvents">Preemption Events</option>
                <option value="throughput">Throughput</option>
                <option value="stabilizationTime">Stabilization Time</option>
              </select>
            </label>
          </div>

          <div className="mt-6 h-[380px] min-h-[380px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={congestionChartData} margin={{ top: 25 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="displayConfig" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={90} />
                <YAxis>
                  <Label
                    value={
                      congestionMetric === "avgCongestionIntensity" ? "Spatial Congestion (0-1)" :
                        congestionMetric === "avgCongestionIntensityDemand" ? "Demand Congestion (0-1)" :
                          congestionMetric === "congestionLevel" ? "Congestion Index (%)" :
                            congestionMetric === "avgTotalQueue" ? "Avg Queue (veh)" :
                              (congestionMetric === "starvationEvents" || congestionMetric === "preemptionEvents") ? "Event Count" :
                                congestionMetric === "throughput" ? "Throughput (veh)" :
                                  congestionMetric === "stabilizationTime" ? "Time (s)" : "Queue Length (veh)"
                    }
                    angle={-90}
                    position="insideLeft"
                    style={{ textAnchor: 'middle', fontSize: '11px', fill: '#64748b', fontWeight: 600 }}
                  />
                </YAxis>
                <Tooltip content={<CustomCongestionTooltip />} />
                <Legend />
                <Bar
                  dataKey={congestionMetric}
                  name={congestionValueLabel}
                  fill={
                    congestionMetric === "avgCongestionIntensity" ? "#f97316" :
                      congestionMetric === "avgCongestionIntensityDemand" ? "#ef4444" :
                        congestionMetric === "avgTotalQueue" ? "#0ea5e9" :
                          congestionMetric === "peakTotalQueue" ? "#f43f5e" :
                            congestionMetric === "avgNsQueue" ? "#10b981" :
                              congestionMetric === "avgEwQueue" ? "#8b5cf6" :
                                congestionMetric === "starvationEvents" ? "#f59e0b" :
                                  congestionMetric === "preemptionEvents" ? "#10b981" :
                                    congestionMetric === "stabilizationTime" ? "#d946ef" :
                                      "#6366f1"
                  }
                  minPointSize={3}
                >
                  <LabelList dataKey={
                    congestionMetric === "avgCongestionIntensity" ? "pctDiffStrAvgCongestionIntensity" :
                      congestionMetric === "avgCongestionIntensityDemand" ? "pctDiffStrAvgCongestionIntensityDemand" :
                        congestionMetric === "congestionLevel" ? "pctDiffStrCongestionLevel" :
                          congestionMetric === "avgTotalQueue" ? "pctDiffStrAvgTotalQueue" :
                            congestionMetric === "peakTotalQueue" ? "pctDiffStrPeakTotalQueue" :
                              congestionMetric === "avgNsQueue" ? "pctDiffStrAvgNsQueue" :
                                congestionMetric === "avgEwQueue" ? "pctDiffStrAvgEwQueue" :
                                  congestionMetric === "starvationEvents" ? "pctDiffStrStarvationEvents" :
                                    congestionMetric === "preemptionEvents" ? "pctDiffStrPreemptionEvents" :
                                      congestionMetric === "stabilizationTime" ? "pctDiffStrStabilizationTime" :
                                        "pctDiffStrThroughput"
                  } content={(props) => <CustomPercentLabel {...props} invertColor={congestionMetric === "throughput"} showPercentages={showPercentages} />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-none">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Section 5: Signal Timing Summary</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between gap-x-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Simulation Start</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{formatDateTimeLabel(signalStartLabel)}</span>
            </div>
            <div className="flex items-center justify-between gap-x-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Simulation End</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{formatDateTimeLabel(signalEndLabel)}</span>
            </div>
          </div>

          {signalTimingEmpty ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
              No signal timing data available for this run.
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {signalTimingRows.map((row) => {
                const nsReference = Math.max(
                  row.ns.durations.green.max,
                  row.ns.durations.yellow.max,
                  row.ns.durations.red.max,
                  1
                );
                const ewReference = Math.max(
                  row.ew.durations.green.max,
                  row.ew.durations.yellow.max,
                  row.ew.durations.red.max,
                  1
                );
                const nsGreenBar = toRangeBar(row.ns.durations.green.min, row.ns.durations.green.max, row.ns.durations.green.avg, nsReference);
                const nsYellowBar = toRangeBar(row.ns.durations.yellow.min, row.ns.durations.yellow.max, row.ns.durations.yellow.avg, nsReference);
                const nsRedBar = toRangeBar(row.ns.durations.red.min, row.ns.durations.red.max, row.ns.durations.red.avg, nsReference);
                const ewGreenBar = toRangeBar(row.ew.durations.green.min, row.ew.durations.green.max, row.ew.durations.green.avg, ewReference);
                const ewYellowBar = toRangeBar(row.ew.durations.yellow.min, row.ew.durations.yellow.max, row.ew.durations.yellow.avg, ewReference);
                const ewRedBar = toRangeBar(row.ew.durations.red.min, row.ew.durations.red.max, row.ew.durations.red.avg, ewReference);

                return (
                  <article key={row.config} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 shadow-sm dark:shadow-none">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
                      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">{toTitleFromConfig(row.config)}</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${networkLayoutSummary.nsAxis
                            ? "bg-cyan-100 text-cyan-800"
                            : `bg-slate-200 text-slate-500 ${UNAVAILABLE_VISUAL_CLASS}`
                            }`}
                        >
                          NS G-&gt;R: {row.ns.greenToRedChanges}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${networkLayoutSummary.ewAxis
                            ? "bg-cyan-100 text-cyan-800"
                            : `bg-slate-200 text-slate-500 ${UNAVAILABLE_VISUAL_CLASS}`
                            }`}
                        >
                          EW G-&gt;R: {row.ew.greenToRedChanges}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div
                        className={`rounded-lg border p-3 ${networkLayoutSummary.nsAxis
                          ? "border-emerald-200 bg-white dark:bg-slate-900"
                          : `border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 ${UNAVAILABLE_VISUAL_CLASS}`
                          }`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">NS Stoplight</p>
                        {!networkLayoutSummary.nsAxis && (
                          <span className={`${UNAVAILABLE_BADGE_CLASS} mt-2`}>{UNAVAILABLE_LABEL}</span>
                        )}
                        <div className="mt-3 space-y-3 text-sm">
                          <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="font-medium">Green</span>
                              <span className="font-semibold text-xs">min {formatDurationValue(row.ns.durations.green.min)} | avg {formatDurationValue(row.ns.durations.green.avg)} | max {formatDurationValue(row.ns.durations.green.max)}</span>
                            </div>
                            <div className="relative h-2 rounded-full bg-emerald-200/50">
                              <span className="absolute top-0 h-2 rounded-full bg-emerald-300" style={{ left: nsGreenBar.left, width: nsGreenBar.width }} />
                              <span className="absolute top-[-2px] h-3 w-1 bg-emerald-700 shadow-[0_0_8px_rgba(4,120,87,0.5)] z-10" style={{ left: nsGreenBar.avgLeft }} />
                            </div>
                          </div>
                          <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="font-medium">Yellow</span>
                              <span className="font-semibold text-xs">min {formatDurationValue(row.ns.durations.yellow.min)} | avg {formatDurationValue(row.ns.durations.yellow.avg)} | max {formatDurationValue(row.ns.durations.yellow.max)}</span>
                            </div>
                            <div className="relative h-2 rounded-full bg-amber-200/50">
                              <span className="absolute top-0 h-2 rounded-full bg-amber-300" style={{ left: nsYellowBar.left, width: nsYellowBar.width }} />
                              <span className="absolute top-[-2px] h-3 w-1 bg-amber-700 shadow-[0_0_8px_rgba(180,83,9,0.5)] z-10" style={{ left: nsYellowBar.avgLeft }} />
                            </div>
                          </div>
                          <div className="rounded-md bg-rose-50 px-3 py-2 text-rose-900">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="font-medium">Red</span>
                              <span className="font-semibold text-xs">min {formatDurationValue(row.ns.durations.red.min)} | avg {formatDurationValue(row.ns.durations.red.avg)} | max {formatDurationValue(row.ns.durations.red.max)}</span>
                            </div>
                            <div className="relative h-2 rounded-full bg-rose-200/50">
                              <span className="absolute top-0 h-2 rounded-full bg-rose-300" style={{ left: nsRedBar.left, width: nsRedBar.width }} />
                              <span className="absolute top-[-2px] h-3 w-1 bg-rose-700 shadow-[0_0_8px_rgba(190,18,60,0.5)] z-10" style={{ left: nsRedBar.avgLeft }} />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`rounded-lg border p-3 ${networkLayoutSummary.ewAxis
                          ? "border-sky-200 bg-white dark:bg-slate-900"
                          : `border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 ${UNAVAILABLE_VISUAL_CLASS}`
                          }`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">EW Stoplight</p>
                        {!networkLayoutSummary.ewAxis && (
                          <span className={`${UNAVAILABLE_BADGE_CLASS} mt-2`}>{UNAVAILABLE_LABEL}</span>
                        )}
                        <div className="mt-3 space-y-3 text-sm">
                          <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="font-medium">Green</span>
                              <span className="font-semibold text-xs">min {formatDurationValue(row.ew.durations.green.min)} | avg {formatDurationValue(row.ew.durations.green.avg)} | max {formatDurationValue(row.ew.durations.green.max)}</span>
                            </div>
                            <div className="relative h-2 rounded-full bg-emerald-200/50">
                              <span className="absolute top-0 h-2 rounded-full bg-emerald-300" style={{ left: ewGreenBar.left, width: ewGreenBar.width }} />
                              <span className="absolute top-[-2px] h-3 w-1 bg-emerald-700 shadow-[0_0_8px_rgba(4,120,87,0.5)] z-10" style={{ left: ewGreenBar.avgLeft }} />
                            </div>
                          </div>
                          <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="font-medium">Yellow</span>
                              <span className="font-semibold text-xs">min {formatDurationValue(row.ew.durations.yellow.min)} | avg {formatDurationValue(row.ew.durations.yellow.avg)} | max {formatDurationValue(row.ew.durations.yellow.max)}</span>
                            </div>
                            <div className="relative h-2 rounded-full bg-amber-200/50">
                              <span className="absolute top-0 h-2 rounded-full bg-amber-300" style={{ left: ewYellowBar.left, width: ewYellowBar.width }} />
                              <span className="absolute top-[-2px] h-3 w-1 bg-amber-700 shadow-[0_0_8px_rgba(180,83,9,0.5)] z-10" style={{ left: ewYellowBar.avgLeft }} />
                            </div>
                          </div>
                          <div className="rounded-md bg-rose-50 px-3 py-2 text-rose-900">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="font-medium">Red</span>
                              <span className="font-semibold text-xs">min {formatDurationValue(row.ew.durations.red.min)} | avg {formatDurationValue(row.ew.durations.red.avg)} | max {formatDurationValue(row.ew.durations.red.max)}</span>
                            </div>
                            <div className="relative h-2 rounded-full bg-rose-200/50">
                              <span className="absolute top-0 h-2 rounded-full bg-rose-300" style={{ left: ewRedBar.left, width: ewRedBar.width }} />
                              <span className="absolute top-[-2px] h-3 w-1 bg-rose-700 shadow-[0_0_8px_rgba(190,18,60,0.5)] z-10" style={{ left: ewRedBar.avgLeft }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="pt-12 mt-16 border-t border-slate-200 dark:border-slate-800/80 text-center text-xs text-slate-500 dark:text-slate-400 font-medium flex flex-col sm:flex-row items-center justify-between gap-4 z-10 relative">
          <p>© 2026 Sumo Traffic Management Suite. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
            <Link href="/project_overview" className="hover:text-slate-800 dark:hover:text-slate-200 transition">Project Overview</Link>
            <span>•</span>
            <Link href="/simulation_dashboard" className="hover:text-slate-800 dark:hover:text-slate-200 transition">Control Hub</Link>
            <span>•</span>
            <Link href="/simulation_data" className="hover:text-slate-800 dark:hover:text-slate-200 transition">Simulation Data</Link>
            <span>•</span>
            <Link href="/traffic_charts" className="hover:text-slate-800 dark:hover:text-slate-200 transition">Traffic Charts</Link>
            <span>•</span>
            <Link href="/system_help" className="hover:text-slate-800 dark:hover:text-slate-200 transition">System Help</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
