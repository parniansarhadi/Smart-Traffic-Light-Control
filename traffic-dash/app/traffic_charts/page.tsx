"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "../_components/ThemeToggle";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Label,
} from "recharts";
import {
  buildNetworkLayoutSummary,
  type DirectionAvailability as SharedDirectionAvailability,
} from "../_lib/network-layout-summary";
import {
  UNAVAILABLE_BADGE_CLASS,
  UNAVAILABLE_LABEL,
} from "../_lib/unavailable-ui";

type HistoryPoint = {
  step: number;
  [key: string]: unknown;
};

type DashboardResponse = {
  status: "success" | "error";
  timestamp?: string;
  summary?: unknown;
  history?: HistoryPoint[];
  history_by_mode?: Record<string, HistoryPoint[]>;
  section1?: {
    totalVehicles?: number;
    vehicleTypes?: Array<{
      type?: string;
      count?: number;
    }>;
    totalWaitingVehicles?: number;
    waitingVehicleTypes?: Array<{
      type?: string;
      count?: number;
    }>;
  };
  wallClockStart?: string;
  wallClockEnd?: string;
  scenarioStart?: string;
  scenarioEnd?: string;
  simulationStartDateTime?: string;
  simulationEndDateTime?: string;
  runType?: string;
  optimizationGoal?: string;
  baseConfigOptimized?: string;
  message?: string;
};

type SimulationDataResponse = {
  status: "success" | "error";
  section3?: {
    plots?: string[];
  };
  section4?: {
    networkLayoutSummary?: {
      directionAvailability?: SharedDirectionAvailability;
      nsAxis?: boolean;
      ewAxis?: boolean;
      availableDirections?: string[];
      missingDirections?: string[];
      hasAnyDirection?: boolean;
    };
  };
};

type GeometryDirection = "north" | "south" | "east" | "west";

type GeometryApiResponse = {
  status: "success" | "missing" | "error";
  polylines?: Array<{
    direction: GeometryDirection;
    flow: "incoming" | "outgoing";
  }>;
  directionAvailability?: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
  };
  networkLayoutSummary?: {
    directionAvailability?: SharedDirectionAvailability;
    nsAxis?: boolean;
    ewAxis?: boolean;
    availableDirections?: string[];
    missingDirections?: string[];
    hasAnyDirection?: boolean;
  };
};

type DirectionAvailability = {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
  nsAxis: boolean;
  ewAxis: boolean;
};

type SummaryConfig = {
  config?: string;
  total_vehicles?: number;
  total_pedestrians?: number;
  vehicle_type_counts?: {
    car?: number;
    truck?: number;
    motorcycle?: number;
    bus?: number;
    emergency?: number;
  };
  [key: string]: unknown;
};

type ChartType = "line" | "area" | "bar" | "step";
type PeriodPreset = "all" | "15m" | "1h" | "6h" | "24h";
type TimeScaleUnit = "second" | "minute" | "hour" | "day" | "week" | "month";

type MetricOption = {
  key: string;
  label: string;
  color: string;
  chartType?: ChartType;
  unit?: string;
};

type MetricGroup = {
  title: string;
  metricKeys: string[];
  includeLightStatus?: boolean;
};

type ModeSelectionRow = {
  id: number;
  simulationMode: "Fixed" | "Adaptive";
  preemptionEnabled: boolean;
  priorityEnabled: boolean;
  optimized?: boolean;
  goalKey?: string;
};

type LineStyleOverride = {
  dashPattern?: string;
  color?: string;
  lineWidth?: number;
};

type SeriesSettingsOverride = {
  chartType?: ChartType;
  distributionType?: "individual" | "cfd";
  countingMode?: "summation" | "unique";
  flatLineY?: number;
  showHighlight?: boolean;
  showLine?: boolean;
  showChart?: boolean;
  showMinChart?: boolean;
  showMaxChart?: boolean;
  showMinMaxChart?: boolean;
  showCycling?: boolean;
};

type ChartPoint = {
  step: number;
  timestampMs: number;
  [key: string]: string | number | null | undefined;
};

type LightStatus = "green" | "yellow" | "red";

const METRIC_OPTIONS: MetricOption[] = [

  { key: "all_v_wait_total", label: "All Vehicle Wait Total", color: "#1d4ed8" },
  { key: "v_wait_total", label: "Regular Vehicle Wait Total", color: "#3b82f6" },
  { key: "ev_wait_total", label: "Emergency Vehicle Wait Total", color: "#b91c1c" },
  { key: "pt_wait_total", label: "Public Transport Wait Total", color: "#0f766e" },
  { key: "p_wait_total", label: "Pedestrian Wait Total", color: "#6d28d9" },

  { key: "all_v_wait_avg", label: "All Vehicle Wait Avg", color: "#2563eb" },
  { key: "v_wait_avg", label: "Regular Vehicle Wait Avg", color: "#3b82f6" },
  { key: "ev_wait_avg", label: "Emergency Vehicle Wait Avg", color: "#dc2626" },
  { key: "pt_wait_avg", label: "Public Transport Wait Avg", color: "#0f766e" },
  { key: "p_wait_avg", label: "Pedestrian Wait Avg", color: "#7c3aed" },

  { key: "all_v_wait_max", label: "All Vehicle Wait Max", color: "#1e40af" },
  { key: "v_wait_max", label: "Regular Vehicle Wait Max", color: "#1d4ed8" },
  { key: "ev_wait_max", label: "Emergency Vehicle Wait Max", color: "#b91c1c" },
  { key: "pt_wait_max", label: "Public Transport Wait Max", color: "#059669" },
  { key: "p_wait_max", label: "Pedestrian Wait Max", color: "#6d28d9" },

  { key: "v_life_avg", label: "All Vehicles Avg Trip Delay", color: "#2563eb" },
  { key: "reg_life_avg", label: "Regular Trip Delay", color: "#3b82f6" },
  { key: "ev_life_avg", label: "Emergency Trip Delay", color: "#ef4444" },
  { key: "pt_life_avg", label: "Bus Trip Delay", color: "#0f766e" },
  { key: "p_life_avg", label: "Avg Delay Per Pedestrian", color: "#7c3aed" },

  { key: "all_v_count", label: "All Vehicle Count", color: "#374151" },
  { key: "car_count", label: "Car Count", color: "#4b5563" },
  { key: "motorcycle_count", label: "Motorcycle Count", color: "#60a5fa" },
  { key: "truck_count", label: "Truck Count", color: "#f97316" },
  { key: "emergency_vehicle_count", label: "Emergency Vehicle Count", color: "#dc2626" },
  { key: "pt_count", label: "Public Transport Count", color: "#0f766e" },
  { key: "ped_total_count", label: "Pedestrian Presence", color: "#334155" },

  { key: "throughput", label: "System Throughput", color: "#059669" },
  { key: "all_v_cleared", label: "Total Vehicles Cleared", color: "#0ea5e9" },
  { key: "crossing_car", label: "Cars Cleared", color: "#64748b" },
  { key: "crossing_motorcycle", label: "Motorcycles Cleared", color: "#38bdf8" },
  { key: "crossing_truck", label: "Trucks Cleared", color: "#fb923c" },
  { key: "crossing_bus", label: "Buses Cleared", color: "#0f766e" },
  { key: "crossing_emergency", label: "Emergency Cleared", color: "#ef4444" },

  { key: "queue_total", label: "Total Queue", color: "#0891b2" },
  { key: "ns_queue", label: "North-South Queue", color: "#ea580c" },
  { key: "ew_queue", label: "East-West Queue", color: "#16a34a" },
  { key: "max_queue_length", label: "Peak Total Queue", color: "#b45309" },
  { key: "max_ns_queue", label: "Peak NS Queue", color: "#c2410c" },
  { key: "max_ew_queue", label: "Peak EW Queue", color: "#15803d" },
  { key: "congestion_level", label: "Spatial Congestion Intensity (Q/30)", color: "#be123c" },
  { key: "ns_congestion", label: "NS Spatial Congestion (Q/30)", color: "#e11d48" },
  { key: "ew_congestion", label: "EW Spatial Congestion (Q/30)", color: "#f43f5e" },
  { key: "congestion_level_demand", label: "Demand Congestion Intensity (Q/N_active)", color: "#9f1239" },
  { key: "ns_congestion_demand", label: "NS Demand Congestion (Q/N_active)", color: "#be123c" },
  { key: "ew_congestion_demand", label: "EW Demand Congestion (Q/N_active)", color: "#e11d48" },
  { key: "lane_utilization", label: "Overall Lane Utilization", color: "#1d4ed8" },
  { key: "ns_lane_utilization", label: "NS Lane Utilization", color: "#2563eb" },
  { key: "ew_lane_utilization", label: "EW Lane Utilization", color: "#60a5fa" },

  { key: "threshold", label: "Adaptive Threshold", color: "#1d4ed8" },
  { key: "ns_weight", label: "NS Priority Weight", color: "#be123c" },
  { key: "ew_weight", label: "EW Priority Weight", color: "#4338ca" },
  { key: "ns_qdr", label: "NS Dissipation Rate", color: "#0d9488" },
  { key: "ew_qdr", label: "EW Dissipation Rate", color: "#a16207" },

  { key: "preemption_events", label: "Preemption Active Time", color: "#eab308", chartType: "line", unit: "s" },
  { key: "preemption_holds", label: "Preemption Holds", color: "#f43f5e" },
  { key: "preemption_interruptions", label: "Preemption Interruptions", color: "#ef4444" },
  { key: "preemption_force_switches", label: "Preemption Override Switches", color: "#ec4899" },
  { key: "starvation_events", label: "Starvation Recovery Time", color: "#f59e42", chartType: "line", unit: "s" },
  { key: "starvation_interruptions", label: "Starvation Interruptions", color: "#fb923c" },
  { key: "ped_collisions", label: "Safety Critical Events (Collisions)", color: "#f43f5e" },

  { key: "avg_time_loss", label: "Average Time Loss", color: "#7c3aed" },
  { key: "total_vehicle_stops", label: "Total Vehicle Stops", color: "#475569" },
  { key: "step_co2", label: "Emission Rate (CO₂)", color: "#059669", unit: "g/s" },
  { key: "total_co2", label: "Network Total CO₂", color: "#16a34a", unit: "g" },
  { key: "step_fuel", label: "Fuel Consumption", color: "#dc2626", unit: "g/s" },
  { key: "total_fuel", label: "Network Total Fuel", color: "#b91c1c", unit: "g" },
  { key: "ped_time_saved", label: "Pedestrian Time Saved", color: "#1d4ed8", unit: "s" },
  { key: "event_starvation_active", label: "Recovery: Starvation Active", color: "#f59e42", chartType: "step" },
  { key: "event_preemption_active", label: "Recovery: Preemption Active", color: "#ef4444", chartType: "step" },
  { key: "event_recovery_active", label: "System Recovery Active (Combined)", color: "#10b981", chartType: "step" },
];

const METRIC_SECTIONS = [
  {
    id: "performance",
    title: "System Performance",
    subtitle: "Aggregate delays and individual trip experience",
    groups: ["Total Delays (Pressure)", "Avg Wait Times", "Max Wait Times", "Individual Experience Metrics"],
  },
  {
    id: "operations",
    title: "Operations & Throughput",
    subtitle: "System efficiency and vehicle composition",
    groups: ["Vehicle Composition", "Efficiency Metrics", "Flow And Utilization"],
  },
  {
    id: "infrastructure",
    title: "Infrastructure & Health",
    subtitle: "Queue dynamics and congestion indices",
    groups: ["Queue Metrics (Avg)", "Queue Metrics (Max)", "Congestion Metrics", "Queue Dissipation Rates"],
  },
  {
    id: "intelligence",
    title: "System Intelligence",
    subtitle: "Adaptive controller state and signal priority",
    groups: ["Adaptive Control", "System Weights", "Active Signal Phases", "Controller Logic Flags"],
  },
  {
    id: "safety",
    title: "Safety & Sustainability",
    subtitle: "Incident recovery and environmental impact",
    groups: ["Preemption Analysis", "Starvation Analysis", "Environmental Impact", "Safety Analysis"],
  },
];

const METRIC_GROUPS: MetricGroup[] = [
  {
    title: "Total Delays (Pressure)",
    metricKeys: ["all_v_wait_total", "v_wait_total", "ev_wait_total", "pt_wait_total", "p_wait_total"],
  },
  {
    title: "Avg Wait Times",
    metricKeys: ["all_v_wait_avg", "v_wait_avg", "ev_wait_avg", "pt_wait_avg", "p_wait_avg"],
  },
  {
    title: "Max Wait Times",
    metricKeys: ["all_v_wait_max", "v_wait_max", "ev_wait_max", "pt_wait_max", "p_wait_max"],
  },
  {
    title: "Individual Experience Metrics",
    metricKeys: ["v_life_avg", "reg_life_avg", "ev_life_avg", "pt_life_avg", "p_life_avg"],
  },
  {
    title: "Efficiency Metrics",
    metricKeys: ["throughput", "avg_time_loss", "total_vehicle_stops"],
  },
  {
    title: "Vehicle Composition",
    metricKeys: ["all_v_count", "car_count", "motorcycle_count", "truck_count", "emergency_vehicle_count", "pt_count", "ped_total_count"],
  },
  {
    title: "Flow And Utilization",
    metricKeys: ["ns_lane_utilization", "ew_lane_utilization", "lane_utilization"],
  },
  {
    title: "Queue Metrics (Avg)",
    metricKeys: ["ns_queue", "ew_queue", "queue_total"],
  },
  {
    title: "Queue Metrics (Max)",
    metricKeys: ["max_ns_queue", "max_ew_queue", "max_queue_length"],
  },
  {
    title: "Congestion Metrics",
    metricKeys: ["ns_congestion", "ew_congestion", "congestion_level", "ns_congestion_demand", "ew_congestion_demand", "congestion_level_demand"],
  },
  {
    title: "Queue Dissipation Rates",
    metricKeys: ["ns_qdr", "ew_qdr"],
  },
  {
    title: "Adaptive Control",
    metricKeys: ["threshold", "preemption_events"],
  },
  {
    title: "System Weights",
    metricKeys: ["ns_weight", "ew_weight"],
  },
  {
    title: "Preemption Analysis",
    metricKeys: ["preemption_interruptions", "preemption_holds", "preemption_force_switches"],
  },
  {
    title: "Starvation Analysis",
    metricKeys: ["starvation_events", "starvation_interruptions"],
  },
  {
    title: "Safety Analysis",
    metricKeys: ["ped_collisions", "ped_time_saved"],
  },
  {
    title: "Active Signal Phases",
    metricKeys: [],
    includeLightStatus: true,
  },
  {
    title: "Environmental Impact",
    metricKeys: ["step_co2", "total_co2", "step_fuel", "total_fuel"],
  },
  {
    title: "Controller Logic Flags",
    metricKeys: ["event_starvation_active", "event_preemption_active", "event_recovery_active"],
  },
];

const PERIOD_TO_MS: Record<Exclude<PeriodPreset, "all">, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

const TIME_SCALE_TO_MS: Record<TimeScaleUnit, number> = {
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const LINE_STYLE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Solid", value: "" },
  { label: "Dashed", value: "8 4" },
  { label: "Dotted", value: "3 3" },
  { label: "Long Dash", value: "12 4 3 4" },
  { label: "Sparse Dash", value: "2 6" },
  { label: "Tight Dash", value: "10 2" },
  { label: "Dash Dot", value: "6 2 2 2" },
  { label: "Fine Dots", value: "1 4" },
];

const NS_LIGHT_SERIES_KEY = "signal::ns_light";
const EW_LIGHT_SERIES_KEY = "signal::ew_light";

const LIGHT_LINE_COLORS: Record<LightStatus, string> = {
  green: "#16a34a",
  yellow: "#ca8a04",
  red: "#dc2626",
};

const LIGHT_BACKGROUND_COLORS: Record<LightStatus, string> = {
  green: "rgba(22, 163, 74, 0.12)",
  yellow: "rgba(202, 138, 4, 0.12)",
  red: "rgba(220, 38, 38, 0.12)",
};

const DISTRIBUTION_METRIC_KEYS = new Set<string>([
  "all_v_wait_total",
  "ev_wait_total",
  "pt_wait_total",
  "p_wait_total",
  "all_v_wait_avg",
  "ev_wait_avg",
  "pt_wait_avg",
  "p_wait_avg",
  "all_v_wait_max",
  "ev_wait_max",
  "pt_wait_max",
  "p_wait_max",
  "all_v_count",
  "car_count",
  "motorcycle_count",
  "truck_count",
  "emergency_vehicle_count",
  "pt_count",
  "all_v_cleared",
  "crossing_car",
  "crossing_motorcycle",
  "crossing_truck",
  "crossing_bus",
  "crossing_emergency",
  "ped_total_count",
  "ped_collisions",
  "ped_time_saved",
  "preemption_switches",
  "preemption_holds",
  "preemption_interruptions",
  "total_vehicle_stops",
  "preemption_events",
  "starvation_events",
  "step_co2",
  "step_fuel",
]);

const COUNTING_MODE_METRIC_KEYS = new Set<string>([
  "all_v_count",
  "car_count",
  "motorcycle_count",
  "truck_count",
  "emergency_vehicle_count",
  "pt_count",
  "all_v_cleared",
  "crossing_car",
  "crossing_motorcycle",
  "crossing_truck",
  "crossing_bus",
  "crossing_emergency",
  "ped_total_count",
  "ped_collisions",
  "ped_time_saved",
]);

const EVENT_COUNT_UNIQUE_AS_SUM_METRICS = new Set<string>([
  "all_v_cleared",
  "crossing_car",
  "crossing_motorcycle",
  "crossing_truck",
  "crossing_bus",
  "crossing_emergency",
  "step_co2",
  "step_fuel",
]);

function normalizeLightStatus(value: unknown): LightStatus | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "green" || normalized === "yellow" || normalized === "red") {
    return normalized;
  }

  return null;
}

function getDirectionalLightStatus(point: HistoryPoint): { ns: LightStatus | null; ew: LightStatus | null } {
  const nsCandidates = [point.ns_light_status, point.ns_light, point.ns_signal_status, point.ns_signal];
  const ewCandidates = [point.ew_light_status, point.ew_light, point.ew_signal_status, point.ew_signal];

  let ns = nsCandidates.map(normalizeLightStatus).find((status) => status !== null) ?? null;
  let ew = ewCandidates.map(normalizeLightStatus).find((status) => status !== null) ?? null;

  const nsGreenActive = Number(point.ns_green_active ?? Number.NaN);
  if ((!ns || !ew) && Number.isFinite(nsGreenActive)) {
    if (nsGreenActive > 0) {
      ns = ns ?? "green";
      ew = ew ?? "red";
    } else {
      ns = ns ?? "red";
      ew = ew ?? "green";
    }
  }

  const shared = normalizeLightStatus(point.light_status);
  if (!ns) ns = shared;
  if (!ew) ew = shared;

  return { ns, ew };
}

function isSignalLightSeries(seriesKey: string): boolean {
  return seriesKey.includes(NS_LIGHT_SERIES_KEY) || seriesKey.includes(EW_LIGHT_SERIES_KEY);
}

function parseRunTimestamp(timestamp?: string): Date | null {
  if (!timestamp) return null;

  const isoDate = new Date(timestamp);
  if (!isNaN(isoDate.getTime())) return isoDate;

  const match = timestamp.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
}

function toDateInputValue(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimeLabel(step: number, unit: TimeScaleUnit): string {
  return formatStepAsTime(step, unit);
}

function formatStepAsTime(step: number, unit: TimeScaleUnit): string {
  const totalSeconds = Math.floor(step);

  if (unit === "second") {
    return `${totalSeconds}s`;
  }

  if (unit === "minute") {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  if (unit === "hour") {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  if (unit === "day") {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  }

  if (unit === "week") {
    const weeks = Math.floor(totalSeconds / 604800);
    const days = Math.floor((totalSeconds % 604800) / 86400);
    return `${weeks}w ${days}d`;
  }

  if (unit === "month") {
    const months = Math.floor(totalSeconds / 2592000); 
    const days = Math.floor((totalSeconds % 2592000) / 86400);
    return `${months}mo ${days}d`;
  }

  return `${step}`;
}

function formatScaleUnit(unit: TimeScaleUnit, value: number): string {
  const base = `${unit}${value === 1 ? "" : "s"}`;
  return base;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";

  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatElapsedLabel(elapsedMs: number): string {
  return `${formatDuration(elapsedMs)} elapsed`;
}

function getLightTextColor(status: LightStatus | null): string {
  return status ? LIGHT_LINE_COLORS[status] : "#334155";
}

function formatSignalElapsed(status: LightStatus | null, elapsedMs: number): string {
  if (!status) return "inactive";
  return `${status} for ${formatDuration(elapsedMs)}`;
}

function getMetricValue(point: HistoryPoint, metricKey: string): number {

  if (metricKey === "preemption_events") {
    const active = Number(point.event_preemption_active ?? 0) > 0;
    if (!active) return 0;
    const ms = Number(point.preemption_elapsed_ms ?? 0);
    return ms > 0 ? ms / 1000 : 1; 
  }
  if (metricKey === "starvation_events") {
    const active = Number(point.event_starvation_active ?? 0) > 0;
    if (!active) return 0;
    const ms = Number(point.starvation_elapsed_ms ?? 0);
    return ms > 0 ? ms / 1000 : 1; 
  }
  const nsQueue = Number(point.ns_queue ?? 0);
  const ewQueue = Number(point.ew_queue ?? 0);
  const nsMaxQueue = Number(point.max_ns_queue ?? 0);
  const ewMaxQueue = Number(point.max_ew_queue ?? 0);
  const nsUtilization = Number(point.ns_lane_utilization ?? point.ns_utilization ?? 0);
  const ewUtilization = Number(point.ew_lane_utilization ?? point.ew_utilization ?? 0);

  const nsQdr = Number(point.ns_qdr ?? Number.NaN);
  const ewQdr = Number(point.ew_qdr ?? Number.NaN);
  const nsActive = Number(point.ns_active_count ?? 30);
  const ewActive = Number(point.ew_active_count ?? 30);
  const derivedNsCongestionSpatial = nsQueue <= 2 ? 0 : Math.min(1, nsQueue / 30.0);
  const derivedEwCongestionSpatial = ewQueue <= 2 ? 0 : Math.min(1, ewQueue / 30.0);
  const derivedNsCongestionDemand = nsQueue <= 2 ? 0 : Math.min(1, nsQueue / Math.max(10, nsActive));
  const derivedEwCongestionDemand = ewQueue <= 2 ? 0 : Math.min(1, ewQueue / Math.max(10, ewActive));

  const nsCongestionRawSpatial = Number(point.ns_congestion ?? point.ns_congestion_level ?? point.ns_congestion_ratio ?? Number.NaN);
  const ewCongestionRawSpatial = Number(point.ew_congestion ?? point.ew_congestion_level ?? point.ew_congestion_ratio ?? Number.NaN);
  const nsCongestionSpatial = Number.isFinite(nsCongestionRawSpatial) ? Math.max(0, Math.min(1, nsCongestionRawSpatial)) : derivedNsCongestionSpatial;
  const ewCongestionSpatial = Number.isFinite(ewCongestionRawSpatial) ? Math.max(0, Math.min(1, ewCongestionRawSpatial)) : derivedEwCongestionSpatial;

  const nsCongestionRawDemand = Number(point.ns_congestion_demand ?? Number.NaN);
  const ewCongestionRawDemand = Number(point.ew_congestion_demand ?? Number.NaN);
  const nsCongestionDemand = Number.isFinite(nsCongestionRawDemand) ? Math.max(0, Math.min(1, nsCongestionRawDemand)) : derivedNsCongestionDemand;
  const ewCongestionDemand = Number.isFinite(ewCongestionRawDemand) ? Math.max(0, Math.min(1, ewCongestionRawDemand)) : derivedEwCongestionDemand;

  const counts = (point.counts as { total?: number; emergency?: number; pt?: number; bus?: number }) ?? {};

  const crossingCar = Number(point.crossing_car ?? 0);
  const crossingTruck = Number(point.crossing_truck ?? 0);
  const crossingMotorcycle = Number(point.crossing_motorcycle ?? 0);
  const crossingBus = Number(point.crossing_bus ?? 0);
  const crossingEmergency = Number(point.crossing_emergency ?? 0);

  switch (metricKey) {
    case "all_v_wait_total":
      return Number(point.all_v_wait_avg ?? 0) * Number(counts.total ?? 0);
    case "ev_wait_total":
      return Number(point.ev_wait_avg ?? 0) * Number(counts.emergency ?? 0);
    case "pt_wait_total":
      return Number(point.pt_wait_avg ?? 0) * Number(counts.bus ?? counts.pt ?? point.pt_count ?? point.bus_count ?? 0);
    case "p_wait_total":
      return Number(point.p_wait_avg ?? 0) * Number(point.ped_total_count ?? 0);
    case "queue_total":
      return nsQueue + ewQueue;
    case "max_queue_length":
      return Math.max(nsMaxQueue, ewMaxQueue);
    case "max_ns_queue":
      return nsMaxQueue;
    case "max_ew_queue":
      return ewMaxQueue;
    case "lane_utilization":
      return (nsUtilization + ewUtilization) / 2;
    case "ns_lane_utilization":
      return nsUtilization;
    case "ew_lane_utilization":
      return ewUtilization;
    case "congestion_level":
      return (nsCongestionSpatial + ewCongestionSpatial) / 2;
    case "ns_congestion":
      return nsCongestionSpatial;
    case "ew_congestion":
      return ewCongestionSpatial;
    case "congestion_level_demand":
      return (nsCongestionDemand + ewCongestionDemand) / 2;
    case "ns_congestion_demand":
      return nsCongestionDemand;
    case "ew_congestion_demand":
      return ewCongestionDemand;
    case "all_v_count":
      return counts.total ?? 0;
    case "unique_total_vehicles":
      return Number(point.unique_total_vehicles ?? 0);
    case "unique_total_peds":
      return Number(point.unique_total_peds ?? 0);
    case "emergency_vehicle_count":
      return counts.emergency ?? 0;
    case "pt_count":
      return Number(counts.bus ?? counts.pt ?? point.pt_count ?? point.bus_count ?? 0);
    case "all_v_cleared":
      return crossingCar + crossingTruck + crossingMotorcycle + crossingBus + crossingEmergency;
    case "crossing_car":
      return crossingCar;
    case "crossing_motorcycle":
      return crossingMotorcycle;
    case "crossing_truck":
      return crossingTruck;
    case "crossing_bus":
      return crossingBus;
    case "crossing_emergency":
      return crossingEmergency;

    case "ped_total_count":
      return Number(point.ped_total_count ?? 0);
    case "ped_collisions":
      return Number(point.ped_collisions ?? 0);

    case "preemption_holds":
      return Number(point.preemption_holds ?? point.p_holds ?? 0);
    case "preemption_force_switches":
      return Number(point.preemption_force_switches ?? point.p_force_switches ?? 0);
    case "preemption_interruptions":
      const holds = Number(point.preemption_holds ?? point.p_holds ?? 0);
      const switches = Number(point.preemption_force_switches ?? point.p_force_switches ?? 0);
      return holds + switches;
    case "starvation_interruptions":
      return Number(point.starvation_events ?? point.s_events ?? 0);
    case "avg_time_loss":
      return Number(point.avg_time_loss ?? point.mean_time_loss ?? 0);
    case "total_vehicle_stops":
      return Number(point.total_vehicle_stops ?? 0);
    case "step_co2":
      return Number(point.step_co2 ?? 0);
    case "step_fuel":
      return Number(point.step_fuel ?? 0);
    case "total_co2":
      return Number(point.total_co2 ?? 0);
    case "total_fuel":
      return Number(point.total_fuel ?? 0);
    case "ped_time_saved":
      return Number(point.ped_time_saved ?? 0);
    case "event_starvation_active":
      return Number(point.event_starvation_active ?? 0);
    case "event_preemption_active":
      return Number(point.event_preemption_active ?? 0);
    case "event_recovery_active":
      return (Number(point.event_starvation_active ?? 0) > 0 || Number(point.event_preemption_active ?? 0) > 0) ? 1 : 0;
    case "v_life_avg":
      return Number(point.v_life_avg ?? 0);
    case "p_life_avg":
      return Number(point.p_life_avg ?? 0);
    case "ns_green_to_red":
      return Number(point.ns_green_to_red ?? 0);
    case "ew_green_to_red":
      return Number(point.ew_green_to_red ?? 0);
    case "all_v_wait_total":
      return Number(point.all_v_wait_total ?? 0);
    case "ev_wait_total":
      return Number(point.ev_wait_total ?? 0);
    case "pt_wait_total":
      return Number(point.pt_wait_total ?? 0);
    case "p_wait_total":
      return Number(point.p_wait_total ?? 0);

    case "car_count":
    case "motorcycle_count":
    case "truck_count":
      return 0; 

    default:

      const directValue = point[metricKey];
      return typeof directValue === "number" ? directValue : 0;
  }
}

function getVehicleCountFallback(
  point: HistoryPoint,
  metricKey: string,
  vehicleTypeTotals: Record<string, number>
): number {
  const counts = (point.counts as { total?: number; emergency?: number; pt?: number; bus?: number; car?: number; motorcycle?: number; truck?: number }) ?? {};

  switch (metricKey) {
    case "all_v_count":
      return counts.total ?? 0;
    case "emergency_vehicle_count":
      return counts.emergency ?? 0;
    case "pt_count":
      return Number(counts.bus ?? counts.pt ?? point.pt_count ?? point.bus_count ?? 0);
    case "car_count":
      return counts.car ?? vehicleTypeTotals.car ?? vehicleTypeTotals.passenger ?? 0;
    case "motorcycle_count":
      return counts.motorcycle ?? vehicleTypeTotals.motorcycle ?? 0;
    case "truck_count":
      return counts.truck ?? vehicleTypeTotals.truck ?? 0;
    default:
      return getMetricValue(point, metricKey);
  }
}

function getRequiredAxisForMetric(metricKey: string): "ns" | "ew" | null {
  if (metricKey.startsWith("ns_") || metricKey.includes("_ns_")) return "ns";
  if (metricKey.startsWith("ew_") || metricKey.includes("_ew_")) return "ew";
  return null;
}

function isMetricAvailableByLayout(metricKey: string, availability: DirectionAvailability): boolean {
  const requiredAxis = getRequiredAxisForMetric(metricKey);
  if (requiredAxis === "ns") return availability.nsAxis;
  if (requiredAxis === "ew") return availability.ewAxis;
  return true;
}

function getMetricKeyFromSeriesKey(seriesKey: string): string {
  const separatorIndex = seriesKey.indexOf("::");
  if (separatorIndex < 0) return seriesKey;
  return seriesKey.slice(separatorIndex + 2);
}

function isDistributionMetricSeries(seriesKey: string): boolean {
  return DISTRIBUTION_METRIC_KEYS.has(getMetricKeyFromSeriesKey(seriesKey));
}

function isCountingModeMetricSeries(seriesKey: string): boolean {
  return COUNTING_MODE_METRIC_KEYS.has(getMetricKeyFromSeriesKey(seriesKey));
}

const DEFAULT_DIRECTION_AVAILABILITY: DirectionAvailability = {
  north: true,
  south: true,
  east: true,
  west: true,
  nsAxis: true,
  ewAxis: true,
};

const getApexWinnerForGoal = (gKey: string, configurations: Record<string, any>): string => {
  if (gKey === "baseline") return "fixed_no_preempt";
  const keys = Object.keys(configurations).filter(k => k !== "fixed_no_preempt" && k !== "fixed_with_preempt");
  if (keys.length === 0) return "adaptive_weighted_with_preempt";

  let bestKey = keys[0];
  let bestScore = -Infinity;
  let bestThru = -Infinity;

  for (const key of keys) {
    const cData = configurations[key] || {};
    const veh = cData.vehicle || {};
    const ev = cData.emergency || {};
    const pt = cData.pt_bus || {};
    const ped = cData.pedestrian || {};

    const curThru = veh.throughput ?? veh.Count ?? veh['Total Vehicles'] ?? 0;

    let score = 0;
    if (gKey === "throughput") {
      score = curThru;
    } else if (gKey === "eco") {
      score = -((veh['Avg CO2 (g)'] || 999) + (veh['Avg Fuel (g)'] || 999));
    } else if (gKey === "ev_focus") {
      score = -(ev['Average Delay (s)'] ?? veh.ev_avg ?? 999);
    } else if (gKey === "ped_focus") {
      score = -(ped['Average Delay (s)'] ?? veh.p_avg ?? 999);
    } else if (gKey === "low_congestion") {
      score = -(veh['Avg Congestion Level'] || 999);
    } else if (gKey === "fluidity") {
      score = -((veh['Total Stops'] ?? veh.total_vehicle_stops ?? 999) * 10 + (veh['Average Delay (s)'] || 999));
    } else if (gKey === "veh_focus") {
      score = -(veh['Average Delay (s)'] || 999);
    } else if (gKey === "ped_veh_focus") {
      score = -((ped['Average Delay (s)'] ?? veh.p_avg ?? 999) + (veh['Average Delay (s)'] || 999));
    } else {

      score = curThru * 2.0 - (veh['Average Delay (s)'] || 999) * 20.0 - (ped['Average Delay (s)'] ?? veh.p_avg ?? 999) * 10.0 - (veh['Avg CO2 (g)'] || 999) * 0.5;
    }

    if (score > bestScore || (Math.abs(score - bestScore) < 1e-6 && curThru > bestThru)) {
      bestScore = score;
      bestKey = key;
      bestThru = curThru;
    }
  }

  return bestKey;
};

const formatWinnerModeName = (key: string): string => {
  switch (key) {
    case "fixed_no_preempt": return "Fixed (No Preemption)";
    case "fixed_with_preempt": return "Fixed with Preemption";
    case "adaptive_no_preempt": return "Adaptive (No Preemption)";
    case "adaptive_weighted": return "Adaptive with Priority (Weighted)";
    case "adaptive_with_preempt": return "Adaptive with Preemption";
    case "adaptive_weighted_with_preempt": return "Adaptive Weighted with Preemption";
    default: return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
};

export default function Home() {
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [matrixData, setMatrixData] = useState<any>(null);
  const [optConfigData, setOptConfigData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartFlash, setChartFlash] = useState<boolean>(false);
  const [modeSelections, setModeSelections] = useState<ModeSelectionRow[]>([
    {
      id: 1,
      simulationMode: "Fixed",
      preemptionEnabled: false,
      priorityEnabled: false,
      optimized: false,
    },
  ]);
  const [nextModeSelectionId, setNextModeSelectionId] = useState<number>(2);
  const [xAxisScaleValue, setXAxisScaleValue] = useState<number>(1);
  const [xAxisScaleUnit, setXAxisScaleUnit] = useState<TimeScaleUnit>("second");
  const [intersectionIdOrName, setIntersectionIdOrName] = useState<string>("");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("all");
  const [activeMetricTab, setActiveMetricTab] = useState<string>("performance");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [showNsLightLine, setShowNsLightLine] = useState<boolean>(false);
  const [showEwLightLine, setShowEwLightLine] = useState<boolean>(false);
  const [signalStatusStackStep, setSignalStatusStackStep] = useState<number>(4);
  const [chartZoomLevel, setChartZoomLevel] = useState<number>(1);
  const [chartPanOffsetMs, setChartPanOffsetMs] = useState<number>(0);
  const [isChartPanning, setIsChartPanning] = useState<boolean>(false);
  const [xAxisSource, setXAxisSource] = useState<"timeCounter" | "realTimeline">("timeCounter");
  const [showXAxisSourceMenu, setShowXAxisSourceMenu] = useState<boolean>(false);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [downsampleEnabled, setDownsampleEnabled] = useState<boolean>(true);
  const [maxSamples, setMaxSamples] = useState<number>(800);
  const [tooltipEnabled, setTooltipEnabled] = useState<boolean>(true);
  const [plotOptions, setPlotOptions] = useState<string[]>([]);
  const [selectedPlot, setSelectedPlot] = useState<string>("");
  const [lineStyleOverrides, setLineStyleOverrides] = useState<Record<string, LineStyleOverride>>({});
  const [seriesSettingsOverrides, setSeriesSettingsOverrides] = useState<Record<string, SeriesSettingsOverride>>({});
  const [styleEditorSeriesKey, setStyleEditorSeriesKey] = useState<string | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [deletedSeriesKeys, setDeletedSeriesKeys] = useState<Set<string>>(new Set());
  const [deletedSeriesHistory, setDeletedSeriesHistory] = useState<string[]>([]);
  const [pendingDeleteSeries, setPendingDeleteSeries] = useState<{ key: string; label: string } | null>(null);
  const [directionAvailability, setDirectionAvailability] =
    useState<DirectionAvailability>(DEFAULT_DIRECTION_AVAILABILITY);
  const [isMounted, setIsMounted] = useState(false);

  const getSeriesShowChart = (seriesKey: string): boolean => {
    return seriesSettingsOverrides[seriesKey]?.showChart ?? false;
  };

  const getSeriesShowCycling = (seriesKey: string): boolean => {
    return seriesSettingsOverrides[seriesKey]?.showCycling ?? false;
  };

  const getSeriesShowLine = (seriesKey: string): boolean => {
    if (isSignalLightSeries(seriesKey)) {
      return seriesSettingsOverrides[seriesKey]?.showLine ?? true;
    }
    return seriesSettingsOverrides[seriesKey]?.showLine ?? true;
  };

  const getSeriesShowMinChart = (seriesKey: string): boolean => {
    const override = seriesSettingsOverrides[seriesKey];
    if (typeof override?.showMinChart === "boolean") return override.showMinChart;
    if (typeof override?.showMinMaxChart === "boolean") return override.showMinMaxChart;
    return false;
  };

  const getSeriesShowMaxChart = (seriesKey: string): boolean => {
    const override = seriesSettingsOverrides[seriesKey];
    if (typeof override?.showMaxChart === "boolean") return override.showMaxChart;
    if (typeof override?.showMinMaxChart === "boolean") return override.showMinMaxChart;
    return false;
  };

  const getSeriesShowHighlight = (seriesKey: string): boolean => {
    if (isSignalLightSeries(seriesKey)) {
      return seriesSettingsOverrides[seriesKey]?.showHighlight ?? false;
    }
    return seriesSettingsOverrides[seriesKey]?.showHighlight ?? false;
  };

  const getSignalFlatLineY = (seriesKey: string): number => {
    const value = Number(seriesSettingsOverrides[seriesKey]?.flatLineY ?? 50);
    if (!Number.isFinite(value)) return 50;
    return value;
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const panStartXRef = useRef<number>(0);
  const panStartOffsetRef = useRef<number>(0);
  const xAxisSourceMenuRef = useRef<HTMLDivElement | null>(null);

  const baseMs = useMemo(() => {
    const start = dashboardData?.scenarioStart || dashboardData?.simulationStartDateTime || dashboardData?.timestamp;
    return parseRunTimestamp(start)?.getTime() ?? 0;
  }, [dashboardData?.scenarioStart, dashboardData?.simulationStartDateTime, dashboardData?.timestamp]);

  const allModes = useMemo(() => {
    const modes = new Set<string>();

    if (Array.isArray(dashboardData?.summary)) {
      (dashboardData.summary as SummaryConfig[]).forEach((item) => {
        if (typeof item.config === "string" && item.config.trim()) {
          modes.add(item.config);
        }
      });
    }

    if (dashboardData?.history_by_mode) {
      Object.keys(dashboardData.history_by_mode).forEach((mode) => modes.add(mode));
    }

    return Array.from(modes);
  }, [dashboardData]);

  const resolveModeForSelection = (selection: ModeSelectionRow): string | null => {
    const normalizedToOriginal = new Map<string, string>();
    allModes.forEach((mode) => {
      normalizedToOriginal.set(mode.trim().toLowerCase().replace(/\s+/g, " "), mode);
    });

    const baseMode = selection.simulationMode === "Fixed"
      ? (selection.preemptionEnabled ? "fixed with preempt" : "fixed no preempt")
      : (selection.preemptionEnabled
        ? (selection.priorityEnabled ? "adaptive weighted with preempt" : "adaptive with preempt")
        : (selection.priorityEnabled ? "adaptive weighted" : "adaptive no preempt"));

    const prefix = selection.goalKey && selection.goalKey !== "baseline"
      ? `goal ${selection.goalKey.replace(/_/g, " ")}`
      : "baseline";

    const fullModeKey = `${prefix} ${baseMode}`.trim().toLowerCase();
    if (normalizedToOriginal.has(fullModeKey)) {
      return normalizedToOriginal.get(fullModeKey)!;
    }

    if (normalizedToOriginal.has(baseMode)) {
      return normalizedToOriginal.get(baseMode)!;
    }

    if (selection.optimized && selection.goalKey) {
      const legacyGoalKey = `adaptive goal ${selection.goalKey.replace(/_/g, " ")}`.trim().toLowerCase();
      if (normalizedToOriginal.has(legacyGoalKey)) {
        return normalizedToOriginal.get(legacyGoalKey)!;
      }
    }

    return null;
  };

  const resolvedModeSelections = useMemo(() => {
    return modeSelections.map((selection) => ({
      id: selection.id,
      selection,
      mode: resolveModeForSelection(selection),
    }));
  }, [modeSelections, allModes]);

  const selectedModesForChart = useMemo(() => {
    const uniqueModes = new Set<string>();
    resolvedModeSelections.forEach((item) => {
      if (item.mode) uniqueModes.add(item.mode);
    });
    return Array.from(uniqueModes);
  }, [resolvedModeSelections]);

  const isStreamMode = useMemo(() => {
    return selectedModesForChart.some((mode) => mode.toLowerCase().includes("stream") || mode.toLowerCase().includes("real"));
  }, [selectedModesForChart]);

  const vehicleTypeTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    const vehicleTypes = dashboardData?.section1?.vehicleTypes ?? [];

    vehicleTypes.forEach((row) => {
      const type = typeof row.type === "string" ? row.type.trim().toLowerCase() : "";
      if (!type) return;

      const count = Number(row.count ?? 0);
      if (!Number.isFinite(count)) return;

      totals[type] = count;
    });

    if (totals.passenger !== undefined && totals.car === undefined) {
      totals.car = totals.passenger;
    }

    return totals;
  }, [dashboardData?.section1?.vehicleTypes]);

  const loadDashboardData = () => {
    fetch("http://127.0.0.1:8000/api/dashboard-data", { cache: "no-store" })
      .then((res) => res.json() as Promise<DashboardResponse>)
      .then((data) => {
        if (data.status === "error") {
          setError(data.message ?? "Failed to load dashboard data.");
          return;
        }
        setError(null);
        setDashboardData(data);
        setLastUpdatedMs(Date.now());
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
  };

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedMs) return "Waiting for data";
    return new Date(lastUpdatedMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [lastUpdatedMs]);

  const latestRunLabel = useMemo(() => {
    const start = dashboardData?.scenarioStart || dashboardData?.simulationStartDateTime;
    if (!start) return "Unknown run";
    const date = new Date(start);
    if (isNaN(date.getTime())) return start;

    return date.toLocaleString([], {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC"
    });
  }, [dashboardData?.scenarioStart, dashboardData?.simulationStartDateTime]);

  const detectedDirectionsLabel = useMemo(() => {
    const dirs: string[] = [];
    if (directionAvailability.north) dirs.push("N");
    if (directionAvailability.south) dirs.push("S");
    if (directionAvailability.east) dirs.push("E");
    if (directionAvailability.west) dirs.push("W");
    return dirs.length > 0 ? dirs.join(",") : "None";
  }, [directionAvailability]);

  const toggleSeriesVisibility = (seriesKey: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(seriesKey)) {
        next.delete(seriesKey);
      } else {
        next.add(seriesKey);
      }
      return next;
    });
  };

  useEffect(() => {
    loadDashboardData();

    const intervalId = window.setInterval(loadDashboardData, 4000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    fetch("/api/simulation-data", { cache: "no-store" })
      .then((res) => res.json() as Promise<SimulationDataResponse>)
      .then((data) => {
        if (data.status !== "success") return;
        if (data.section4?.networkLayoutSummary?.directionAvailability) {
          const summary = buildNetworkLayoutSummary(
            data.section4.networkLayoutSummary.directionAvailability
          );
          setDirectionAvailability({
            ...summary.directionAvailability,
            nsAxis: summary.nsAxis,
            ewAxis: summary.ewAxis,
          });
        }
        const plots = data.section3?.plots ?? [];
        setPlotOptions(plots);
        if (plots.length > 0) {
          setSelectedPlot((prev) => (prev && plots.includes(prev) ? prev : plots[0]));
        }
      })
      .catch(() => {
        setPlotOptions([]);
      });
  }, []);

  useEffect(() => {
    fetch("/api/network-geometry", { cache: "no-store" })
      .then((res) => res.json() as Promise<GeometryApiResponse>)
      .then((payload) => {
        if (payload.status !== "success") {
          return;
        }

        if (payload.networkLayoutSummary) {
          const summary = buildNetworkLayoutSummary(
            payload.networkLayoutSummary.directionAvailability
          );
          setDirectionAvailability({
            ...summary.directionAvailability,
            nsAxis: summary.nsAxis,
            ewAxis: summary.ewAxis,
          });
          return;
        }

        if (payload.directionAvailability) {
          const summary = buildNetworkLayoutSummary(payload.directionAvailability);
          setDirectionAvailability({
            ...summary.directionAvailability,
            nsAxis: summary.nsAxis,
            ewAxis: summary.ewAxis,
          });
          return;
        }

        if (!Array.isArray(payload.polylines) || payload.polylines.length === 0) {
          return;
        }

        const available = new Set<GeometryDirection>();
        payload.polylines.forEach((line) => {
          if (line?.direction) available.add(line.direction);
        });

        const north = available.has("north");
        const south = available.has("south");
        const east = available.has("east");
        const west = available.has("west");

        setDirectionAvailability({
          north,
          south,
          east,
          west,
          nsAxis: north || south,
          ewAxis: east || west,
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setSelectedMetrics((current) =>
      current.filter((metricKey) => isMetricAvailableByLayout(metricKey, directionAvailability))
    );
  }, [directionAvailability]);

  useEffect(() => {
    if (!directionAvailability.nsAxis) {
      setShowNsLightLine(false);
    }
    if (!directionAvailability.ewAxis) {
      setShowEwLightLine(false);
    }
  }, [directionAvailability]);

  useEffect(() => {
    if (!showXAxisSourceMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (xAxisSourceMenuRef.current && !xAxisSourceMenuRef.current.contains(event.target as Node)) {
        setShowXAxisSourceMenu(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [showXAxisSourceMenu]);

  const preemptionEnabledModesForChart = useMemo(() => {
    const uniqueModes = new Set<string>();
    resolvedModeSelections.forEach((item) => {
      if (item.mode && item.selection.preemptionEnabled) {
        uniqueModes.add(item.mode);
      }
    });
    return Array.from(uniqueModes);
  }, [resolvedModeSelections]);

  const unresolvedModeCount = useMemo(
    () => resolvedModeSelections.filter((item) => !item.mode).length,
    [resolvedModeSelections]
  );

  const duplicateModeCount = useMemo(() => {
    const resolvedCount = resolvedModeSelections.filter((item) => Boolean(item.mode)).length;
    return Math.max(0, resolvedCount - selectedModesForChart.length);
  }, [resolvedModeSelections, selectedModesForChart]);

  const selectedModeHistories = useMemo(() => {
    if (!dashboardData) return [] as { mode: string; history: HistoryPoint[] }[];

    return selectedModesForChart.map((mode) => ({
      mode,
      history: dashboardData.history_by_mode?.[mode] ?? [],
    }));
  }, [dashboardData, selectedModesForChart]);

  const summaryByMode = useMemo(() => {
    const byMode = new Map<string, SummaryConfig>();
    if (!Array.isArray(dashboardData?.summary)) return byMode;

    (dashboardData.summary as SummaryConfig[]).forEach((entry) => {
      const mode = typeof entry.config === "string" ? entry.config : "";
      if (!mode) return;
      byMode.set(mode, entry);
    });
    return byMode;
  }, [dashboardData?.summary]);

  const stepDurationMs = useMemo(() => {

    return 1000;
  }, []);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (selectedModeHistories.length === 0) return [];

    const byTimestamp = new Map<number, ChartPoint>();

    selectedModeHistories.forEach(({ mode, history }) => {
      const modeSummary = summaryByMode.get(mode);
      const modeTimestamps: number[] = [];

      const performanceStride = (downsampleEnabled && history.length > maxSamples)
        ? Math.ceil(history.length / maxSamples)
        : 1;

      const granularityStride = Math.max(1, Math.floor((xAxisScaleValue * TIME_SCALE_TO_MS[xAxisScaleUnit]) / 1000));

      const stride = downsampleEnabled ? Math.max(performanceStride, granularityStride) : 1;

      const sampledHistory = stride > 1
        ? history.filter((_, idx) => idx % stride === 0 || idx === history.length - 1)
        : history;

      const distributionMetricCfdSummationTotals: Record<string, number> = {
        all_v_wait_total: 0,
        ev_wait_total: 0,
        pt_wait_total: 0,
        p_wait_total: 0,
        all_v_wait_avg: 0,
        ev_wait_avg: 0,
        pt_wait_avg: 0,
        p_wait_avg: 0,
        all_v_wait_max: 0,
        ev_wait_max: 0,
        pt_wait_max: 0,
        p_wait_max: 0,
        all_v_count: 0,
        car_count: 0,
        motorcycle_count: 0,
        truck_count: 0,
        emergency_vehicle_count: 0,
        pt_count: 0,
        all_v_cleared: 0,
        crossing_car: 0,
        crossing_motorcycle: 0,
        crossing_truck: 0,
        crossing_bus: 0,
        crossing_emergency: 0,
        ped_total_count: 0,
        ped_collisions: 0,
        ped_time_saved: 0,
      };
      const distributionMetricCfdUniqueTotals: Record<string, number> = {
        all_v_wait_total: 0,
        ev_wait_total: 0,
        pt_wait_total: 0,
        p_wait_total: 0,
        all_v_wait_avg: 0,
        ev_wait_avg: 0,
        pt_wait_avg: 0,
        p_wait_avg: 0,
        all_v_wait_max: 0,
        ev_wait_max: 0,
        pt_wait_max: 0,
        p_wait_max: 0,
        all_v_count: 0,
        car_count: 0,
        motorcycle_count: 0,
        truck_count: 0,
        emergency_vehicle_count: 0,
        pt_count: 0,
        all_v_cleared: 0,
        crossing_car: 0,
        crossing_motorcycle: 0,
        crossing_truck: 0,
        crossing_bus: 0,
        crossing_emergency: 0,
        ped_total_count: 0,
        ped_collisions: 0,
        ped_time_saved: 0,
      };
      const distributionMetricPreviousValues: Record<string, number> = {
        all_v_wait_total: 0,
        ev_wait_total: 0,
        pt_wait_total: 0,
        p_wait_total: 0,
        all_v_wait_avg: 0,
        ev_wait_avg: 0,
        pt_wait_avg: 0,
        p_wait_avg: 0,
        all_v_wait_max: 0,
        ev_wait_max: 0,
        pt_wait_max: 0,
        p_wait_max: 0,
        all_v_count: 0,
        car_count: 0,
        motorcycle_count: 0,
        truck_count: 0,
        emergency_vehicle_count: 0,
        pt_count: 0,
        all_v_cleared: 0,
        crossing_car: 0,
        crossing_motorcycle: 0,
        crossing_truck: 0,
        crossing_bus: 0,
        crossing_emergency: 0,
        ped_total_count: 0,
        ped_collisions: 0,
        ped_time_saved: 0,
      };

      let nsStateStartMs: number | null = null;
      let ewStateStartMs: number | null = null;
      let preemptionStartMs: number | null = null;
      let starvationStartMs: number | null = null;
      let previousNsStatus: LightStatus | null = null;
      let previousEwStatus: LightStatus | null = null;
      let previousPreemptionActive = false;
      let previousStarvationActive = false;
      let starvationOccurrenceIndex = -1;

      let nsGreenMin = Infinity; let nsGreenMax = 0;
      let nsRedMin = Infinity; let nsRedMax = 0;
      let ewGreenMin = Infinity; let ewGreenMax = 0;
      let ewRedMin = Infinity; let ewRedMax = 0;

      const activeMetrics = METRIC_OPTIONS.filter(m => selectedMetrics.includes(m.key));
      const arrivalMap: Record<string, string> = {
        all_v_count: 'unique_arrival_all',
        car_count: 'unique_arrival_car',
        motorcycle_count: 'unique_arrival_motorcycle',
        truck_count: 'unique_arrival_truck',
        emergency_vehicle_count: 'unique_arrival_emergency',
        pt_count: 'unique_arrival_bus',
        all_v_cleared: 'unique_exit_all',
        crossing_car: 'unique_exit_car',
        crossing_motorcycle: 'unique_exit_motorcycle',
        crossing_truck: 'unique_exit_truck',
        crossing_emergency: 'unique_exit_emergency',
        crossing_bus: 'unique_exit_bus',
        ped_total_count: 'unique_arrival_ped',
        ped_collisions: 'unique_arrival_ped_collisions'
      };

      sampledHistory.forEach((point) => {
        const step = Number(point.step ?? 0);
        const timestampMs = baseMs + step * stepDurationMs;
        modeTimestamps.push(timestampMs);

        const existing = byTimestamp.get(timestampMs) ?? { step, timestampMs };

        const counts = (point.counts as { emergency?: number }) ?? {};
        const preemptionActive = Number(point.event_preemption_active ?? 0) > 0;
        const starvationActive = Number(point.event_starvation_active ?? 0) > 0;

        existing.event_preemption_active = Math.max(
          Number(existing.event_preemption_active ?? 0),
          preemptionActive ? 1 : 0
        );
        existing.event_starvation_active = Math.max(
          Number(existing.event_starvation_active ?? 0),
          starvationActive ? 1 : 0
        );

        const directionalStatus = getDirectionalLightStatus(point);
        const nsStatus = directionalStatus.ns;
        const ewStatus = directionalStatus.ew;

        if (nsStatus !== previousNsStatus) {
          if (previousNsStatus && nsStateStartMs !== null) {
            const duration = timestampMs - nsStateStartMs;
            if (previousNsStatus === "green") {
              nsGreenMin = Math.min(nsGreenMin, duration);
              nsGreenMax = Math.max(nsGreenMax, duration);
            } else if (previousNsStatus === "red") {
              nsRedMin = Math.min(nsRedMin, duration);
              nsRedMax = Math.max(nsRedMax, duration);
            }
          }
          nsStateStartMs = nsStatus ? timestampMs : null;
          previousNsStatus = nsStatus;
        }

        if (ewStatus !== previousEwStatus) {
          if (previousEwStatus && ewStateStartMs !== null) {
            const duration = timestampMs - ewStateStartMs;
            if (previousEwStatus === "green") {
              ewGreenMin = Math.min(ewGreenMin, duration);
              ewGreenMax = Math.max(ewGreenMax, duration);
            } else if (previousEwStatus === "red") {
              ewRedMin = Math.min(ewRedMin, duration);
              ewRedMax = Math.max(ewRedMax, duration);
            }
          }
          ewStateStartMs = ewStatus ? timestampMs : null;
          previousEwStatus = ewStatus;
        }

        if (preemptionActive !== previousPreemptionActive) {
          preemptionStartMs = preemptionActive ? timestampMs : null;
          previousPreemptionActive = preemptionActive;
        }

        if (starvationActive !== previousStarvationActive) {
          if (starvationActive) {
            starvationOccurrenceIndex += 1;
            starvationStartMs = timestampMs;
          } else {
            starvationStartMs = null;
          }
          previousStarvationActive = starvationActive;
        }

        let curNsGreenMax = nsGreenMax; let curNsGreenMin = nsGreenMin;
        let curNsRedMax = nsRedMax; let curNsRedMin = nsRedMin;
        if (nsStatus === "green" && nsStateStartMs !== null) {
          curNsGreenMax = Math.max(curNsGreenMax, timestampMs - nsStateStartMs);
        }
        if (nsStatus === "red" && nsStateStartMs !== null) {
          curNsRedMax = Math.max(curNsRedMax, timestampMs - nsStateStartMs);
        }

        let curEwGreenMax = ewGreenMax; let curEwGreenMin = ewGreenMin;
        let curEwRedMax = ewRedMax; let curEwRedMin = ewRedMin;
        if (ewStatus === "green" && ewStateStartMs !== null) {
          curEwGreenMax = Math.max(curEwGreenMax, timestampMs - ewStateStartMs);
        }
        if (ewStatus === "red" && ewStateStartMs !== null) {
          curEwRedMax = Math.max(curEwRedMax, timestampMs - ewStateStartMs);
        }

        const preemptionElapsedMs = preemptionActive && preemptionStartMs !== null ? Math.max(0, timestampMs - preemptionStartMs) : 0;
        const starvationElapsedMs = starvationActive && starvationStartMs !== null ? Math.max(0, timestampMs - starvationStartMs) : 0;

        existing[`${mode}::ns_max_green`] = curNsGreenMax > 0 ? curNsGreenMax : NaN;
        existing[`${mode}::ns_min_green`] = curNsGreenMin < Infinity ? curNsGreenMin : NaN;
        existing[`${mode}::ns_max_red`] = curNsRedMax > 0 ? curNsRedMax : NaN;
        existing[`${mode}::ns_min_red`] = curNsRedMin < Infinity ? curNsRedMin : NaN;
        existing[`${mode}::ew_max_green`] = curEwGreenMax > 0 ? curEwGreenMax : NaN;
        existing[`${mode}::ew_min_green`] = curEwGreenMin < Infinity ? curEwGreenMin : NaN;
        existing[`${mode}::ew_max_red`] = curEwRedMax > 0 ? curEwRedMax : NaN;
        existing[`${mode}::ew_min_red`] = curEwRedMin < Infinity ? curEwRedMin : NaN;

        existing[`${mode}::ns_light_status`] = nsStatus ?? null;
        existing[`${mode}::ew_light_status`] = ewStatus ?? null;
        existing[`${mode}::ns_light_elapsed_ms`] = nsStatus && nsStateStartMs !== null ? Math.max(0, timestampMs - nsStateStartMs) : 0;
        existing[`${mode}::ew_light_elapsed_ms`] = ewStatus && ewStateStartMs !== null ? Math.max(0, timestampMs - ewStateStartMs) : 0;
        existing[`${mode}::event_preemption_active`] = preemptionActive ? 1 : 0;
        existing[`${mode}::event_starvation_active`] = starvationActive ? 1 : 0;
        existing[`${mode}::preemption_elapsed_ms`] = preemptionElapsedMs;
        existing[`${mode}::starvation_elapsed_ms`] = starvationElapsedMs;
        existing[`${mode}::starvation_occurrence_index`] = starvationOccurrenceIndex;

        existing.preemption_elapsed_ms = preemptionElapsedMs;
        existing.starvation_elapsed_ms = starvationElapsedMs;
        existing.event_preemption_active = preemptionActive ? 1 : 0;
        existing.event_starvation_active = starvationActive ? 1 : 0;

        activeMetrics.forEach((metric) => {

          const source = (metric.key === "preemption_events" || metric.key === "starvation_events") ? existing : point;
          const value = getVehicleCountFallback(source, metric.key, vehicleTypeTotals);

          existing[`${mode}::${metric.key}`] = value;
          if (DISTRIBUTION_METRIC_KEYS.has(metric.key)) {
            const uniqueField = arrivalMap[metric.key];

            const uniqueDelta = EVENT_COUNT_UNIQUE_AS_SUM_METRICS.has(metric.key)
              ? Math.max(0, value)
              : Math.max(0, value - (distributionMetricPreviousValues[metric.key] ?? 0));

            existing[`${mode}::${metric.key}::individual::unique`] = uniqueDelta;

            if (Number.isFinite(value)) {
              distributionMetricCfdSummationTotals[metric.key] += value;
            }
            if (Number.isFinite(uniqueDelta)) {
              distributionMetricCfdUniqueTotals[metric.key] += uniqueDelta;
            }
            distributionMetricPreviousValues[metric.key] = value;

            let cfdSummation = distributionMetricCfdSummationTotals[metric.key];
            if (metric.key === "starvation_events") {
              cfdSummation = Number(point.starvation_events ?? point.total_starvation_events ?? cfdSummation);
            } else if (metric.key === "preemption_events") {
              cfdSummation = Number(point.preemption_total ?? point.preemption_events ?? cfdSummation);
            } else if (metric.key === "step_co2") {
              cfdSummation = Number(point.total_co2 ?? cfdSummation);
            } else if (metric.key === "step_fuel") {
              cfdSummation = Number(point.total_fuel ?? cfdSummation);
            }

            existing[`${mode}::${metric.key}::cfd::summation`] = cfdSummation;
            existing[`${mode}::${metric.key}::cfd::unique`] =
              distributionMetricCfdUniqueTotals[metric.key];
          }
        });

        existing[`${mode}::ns_green_to_red`] = Number(point.ns_green_to_red ?? 0);
        existing[`${mode}::ew_green_to_red`] = Number(point.ew_green_to_red ?? 0);

        if (!("ns_light_status" in existing) || !("ew_light_status" in existing)) {
          if (nsStatus) existing.ns_light_status = nsStatus;
          if (ewStatus) existing.ew_light_status = ewStatus;
          if (nsStatus && !("light_status" in existing)) existing.light_status = nsStatus;
        }

        byTimestamp.set(timestampMs, existing);
      });

      const getTypeCount = (...typeNames: string[]): number => {
        const types = dashboardData?.section1?.vehicleTypes ?? [];
        for (const name of typeNames) {
          const found = types.find((t) => t.type?.toLowerCase() === name);
          if (found?.count != null && found.count > 0) return found.count;
        }
        return Number.NaN;
      };

      const uniqueTargets: Array<{ key: string; target: number }> = [
        {
          key: "all_v_count", target: Number(
            modeSummary?.total_vehicles
            ?? dashboardData?.section1?.totalVehicles
            ?? Number.NaN
          )
        },
        {
          key: "ped_total_count", target: Number(
            modeSummary?.total_pedestrians
            ?? Number.NaN
          )
        },
        { key: "car_count", target: getTypeCount("car", "passenger") },
        { key: "motorcycle_count", target: getTypeCount("motorcycle") },
        { key: "truck_count", target: getTypeCount("truck") },
        { key: "emergency_vehicle_count", target: getTypeCount("emergency") },
        { key: "pt_count", target: getTypeCount("bus", "pt") },
      ];

      uniqueTargets.forEach(({ key, target }) => {
        if (!Number.isFinite(target) || target < 0 || modeTimestamps.length === 0) return;

        const finalRaw = distributionMetricCfdUniqueTotals[key];
        modeTimestamps.forEach((ts, index) => {
          const chartPoint = byTimestamp.get(ts);
          if (!chartPoint) return;

          const dataKey = `${mode}::${key}::cfd::unique`;
          const rawValue = Number(chartPoint[dataKey] ?? 0);
          const normalizedValue = Math.round(finalRaw > 0
            ? rawValue * (target / finalRaw)
            : target * ((index + 1) / modeTimestamps.length));
          chartPoint[dataKey] = normalizedValue;
        });
      });
    });

    const chartPoints = Array.from(byTimestamp.values()).sort((a, b) => a.timestampMs - b.timestampMs);
    chartPoints.forEach((point) => {
      let starvationLevel = 0;
      selectedModeHistories.forEach(({ mode }) => {
        if (Number(point[`${mode}::event_starvation_active`] ?? 0) > 0) {
          point[`${mode}::starvation_level`] = starvationLevel;
          starvationLevel += 1;
        }
      });
    });

    return chartPoints;
  }, [dashboardData, selectedModeHistories, stepDurationMs, vehicleTypeTotals, baseMs, summaryByMode]);

  const activeMetrics = METRIC_OPTIONS.filter((metric) => selectedMetrics.includes(metric.key));

  const chartSeries = useMemo(() => {
    return selectedModesForChart.flatMap((mode, modeIndex) => {
      return activeMetrics.map((metric) => ({
        mode,
        key: `${mode}::${metric.key}`,
        label: `${metric.label} (${mode})`,
        color: metric.color,
        modeIndex,
      }));
    });
  }, [selectedModesForChart, activeMetrics]);

  const hasPreemptionEnabledSelection = useMemo(
    () => modeSelections.some((selection) => selection.preemptionEnabled),
    [modeSelections]
  );

  const signalStatusSeries = useMemo(() => {
    const series: Array<{ key: string; label: string; color: string; modeIndex: number }> = [];

    selectedModesForChart.forEach((mode, modeIndex) => {
      if (showNsLightLine) {
        series.push({
          key: `${mode}::${NS_LIGHT_SERIES_KEY}`,
          label: `NS Light (${mode})`,
          color: LIGHT_LINE_COLORS.green,
          modeIndex,
        });
      }

      if (showEwLightLine) {
        series.push({
          key: `${mode}::${EW_LIGHT_SERIES_KEY}`,
          label: `EW Light (${mode})`,
          color: LIGHT_LINE_COLORS.green,
          modeIndex,
        });
      }

      if (showNsLightLine && getSeriesShowCycling(`${mode}::${NS_LIGHT_SERIES_KEY}`)) {
        series.push({
          key: `${mode}::ns_green_to_red`,
          label: `NS Signal Cycling (${mode})`,
          color: "#10b981",
          modeIndex,
        });
      }
      if (showEwLightLine && getSeriesShowCycling(`${mode}::${EW_LIGHT_SERIES_KEY}`)) {
        series.push({
          key: `${mode}::ew_green_to_red`,
          label: `EW Signal Cycling (${mode})`,
          color: "#0ea5e9",
          modeIndex,
        });
      }
    });

    return series;
  }, [showNsLightLine, showEwLightLine, preemptionEnabledModesForChart, selectedModesForChart]);

  const combinedChartSeries = useMemo(
    () => [...chartSeries, ...signalStatusSeries],
    [chartSeries, signalStatusSeries]
  );

  const activeChartSeries = useMemo(
    () => combinedChartSeries.filter((series) => !deletedSeriesKeys.has(series.key)),
    [combinedChartSeries, deletedSeriesKeys]
  );

  const visibleChartSeries = activeChartSeries.filter((series) => !hiddenSeries.has(series.key));

  const hasAnyModeData = useMemo(
    () => selectedModeHistories.some(({ history }) => history.length > 0),
    [selectedModeHistories]
  );

  const updateModeSelection = <K extends keyof ModeSelectionRow>(
    id: number,
    field: K,
    value: ModeSelectionRow[K]
  ) => {
    setModeSelections((current) =>
      current.map((row) => {
        if (row.id !== id) return row;

        if (field === "simulationMode") {
          const simulationMode = value as ModeSelectionRow["simulationMode"];
          return {
            ...row,
            simulationMode,
            priorityEnabled: simulationMode === "Adaptive" ? row.priorityEnabled : false,
            optimized: simulationMode === "Adaptive" ? row.optimized : false,
            goalKey: simulationMode === "Adaptive" ? row.goalKey : undefined,
          };
        }

        if (field === "optimized") {
          const optimized = value as boolean;
          return {
            ...row,
            optimized,
            simulationMode: optimized ? "Adaptive" : row.simulationMode,
            preemptionEnabled: optimized ? true : row.preemptionEnabled,
            priorityEnabled: optimized ? true : row.priorityEnabled,
            goalKey: optimized ? (row.goalKey ?? "balanced") : undefined,
          };
        }

        return { ...row, [field]: value };
      })
    );
  };

  const addModeSelectionRow = () => {
    setModeSelections((current) => [
      ...current,
      {
        id: nextModeSelectionId,
        simulationMode: "Fixed",
        preemptionEnabled: false,
        priorityEnabled: false,
        optimized: false,
        goalKey: undefined,
      },
    ]);
    setNextModeSelectionId((current) => current + 1);
  };

  const removeModeSelectionRow = (id: number) => {
    setModeSelections((current) => {
      if (current.length <= 1) return current;
      return current.filter((row) => row.id !== id);
    });
  };

  const addWinnerToChart = (apexKey: string, goalKey: string) => {
    let simulationMode: "Fixed" | "Adaptive" = "Adaptive";
    let preemptionEnabled = false;
    let priorityEnabled = false;
    let optimized = false;

    if (apexKey === "fixed_no_preempt") {
      simulationMode = "Fixed";
      preemptionEnabled = false;
      priorityEnabled = false;
    } else if (apexKey === "fixed_with_preempt") {
      simulationMode = "Fixed";
      preemptionEnabled = true;
      priorityEnabled = false;
    } else if (apexKey === "adaptive_no_preempt") {
      simulationMode = "Adaptive";
      preemptionEnabled = false;
      priorityEnabled = false;
    } else if (apexKey === "adaptive_weighted") {
      simulationMode = "Adaptive";
      preemptionEnabled = false;
      priorityEnabled = true;
    } else if (apexKey === "adaptive_with_preempt") {
      simulationMode = "Adaptive";
      preemptionEnabled = true;
      priorityEnabled = false;
    } else if (apexKey === "adaptive_weighted_with_preempt") {
      simulationMode = "Adaptive";
      preemptionEnabled = true;
      priorityEnabled = true;
    }

    if (goalKey !== "baseline" && simulationMode === "Adaptive") {
      optimized = true;
    }

    setModeSelections((current) => [
      ...current,
      {
        id: nextModeSelectionId,
        simulationMode,
        preemptionEnabled,
        priorityEnabled,
        optimized,
        goalKey: goalKey !== "baseline" ? goalKey : undefined,
      },
    ]);
    setNextModeSelectionId((curr) => curr + 1);
  };

  const MODE_DASH_PATTERNS = ["", "8 4", "3 3", "12 4 3 4", "2 6", "10 2", "6 2 2 2", "1 4"];

  const MODE_FALLBACK_COLORS = [
    "#2563eb",
    "#dc2626",
    "#16a34a",
    "#7c3aed",
    "#ea580c",
    "#0891b2",
    "#be123c",
    "#0d9488",
  ];

  const getModeDashPattern = (modeIndex: number) => {
    return MODE_DASH_PATTERNS[modeIndex % MODE_DASH_PATTERNS.length] || undefined;
  };

  const getSeriesColor = (baseColor: string, modeIndex: number) => {
    if (modeIndex <= 0) {
      return baseColor;
    }

    const baseSeed = Number.parseInt(baseColor.replace("#", "").slice(0, 2), 16);
    const safeSeed = Number.isFinite(baseSeed) ? baseSeed : 0;
    const paletteIndex = (safeSeed + modeIndex * 3) % MODE_FALLBACK_COLORS.length;
    return MODE_FALLBACK_COLORS[paletteIndex];
  };

  const getSeriesStyle = (series: {
    key: string;
    color: string;
    modeIndex: number;
  }) => {
    const override = lineStyleOverrides[series.key];
    const color = override?.color ?? getSeriesColor(series.color, series.modeIndex);
    const dashPattern =
      override?.dashPattern !== undefined
        ? override.dashPattern || undefined
        : getModeDashPattern(series.modeIndex);
    const resolvedChartType: ChartType = isSignalLightSeries(series.key)
      ? "line"
      : seriesSettingsOverrides[series.key]?.chartType ?? chartType;
    const defaultLineWidth = isSignalLightSeries(series.key)
      ? 3
      : resolvedChartType === "area"
        ? 2.2
        : 2.5;
    const lineWidth = Math.max(0.5, Number(override?.lineWidth ?? defaultLineWidth));

    return { color, dashPattern, lineWidth };
  };

  const updateSeriesStyleOverride = (seriesKey: string, patch: Partial<LineStyleOverride>) => {
    setLineStyleOverrides((current) => ({
      ...current,
      [seriesKey]: {
        ...current[seriesKey],
        ...patch,
      },
    }));
  };

  const resetSeriesStyleOverride = (seriesKey: string) => {
    setLineStyleOverrides((current) => {
      const next = { ...current };
      delete next[seriesKey];
      return next;
    });
    setSeriesSettingsOverrides((current) => {
      const next = { ...current };
      delete next[seriesKey];
      return next;
    });
  };

  const deleteSeriesFromChart = (seriesKey: string) => {
    setDeletedSeriesKeys((current) => {
      const next = new Set(current);
      next.add(seriesKey);
      return next;
    });
    setHiddenSeries((current) => {
      const next = new Set(current);
      next.delete(seriesKey);
      return next;
    });
    resetSeriesStyleOverride(seriesKey);
    setDeletedSeriesHistory((current) => [...current, seriesKey]);
    setStyleEditorSeriesKey(null);
    setPendingDeleteSeries(null);
  };

  const undoLastDelete = () => {
    setDeletedSeriesHistory((current) => {
      if (current.length === 0) return current;
      const restoredSeriesKey = current[current.length - 1];
      setDeletedSeriesKeys((deletedCurrent) => {
        const next = new Set(deletedCurrent);
        next.delete(restoredSeriesKey);
        return next;
      });
      return current.slice(0, -1);
    });
  };

  const styleEditorSeries = useMemo(() => {
    if (!styleEditorSeriesKey) return null;
    return activeChartSeries.find((series) => series.key === styleEditorSeriesKey) ?? null;
  }, [styleEditorSeriesKey, activeChartSeries]);

  const styleEditorEffectiveStyle = useMemo(() => {
    if (!styleEditorSeries) {
      return {
        color: "#334155",
        dashPattern: undefined as string | undefined,
        lineWidth: 2.5,
      };
    }
    return getSeriesStyle(styleEditorSeries);
  }, [styleEditorSeries, lineStyleOverrides, seriesSettingsOverrides, chartType]);

  const updateSeriesSettingsOverride = (seriesKey: string, patch: Partial<SeriesSettingsOverride>) => {
    setSeriesSettingsOverrides((current) => ({
      ...current,
      [seriesKey]: {
        ...current[seriesKey],
        ...patch,
      },
    }));
  };

  const getSeriesChartType = (seriesKey: string): ChartType => {
    if (isSignalLightSeries(seriesKey)) {
      return "line";
    }
    const metricKey = getMetricKeyFromSeriesKey(seriesKey);
    const metric = METRIC_OPTIONS.find((m) => m.key === metricKey);
    return seriesSettingsOverrides[seriesKey]?.chartType ?? metric?.chartType ?? chartType;
  };

  const getSeriesDistributionType = (seriesKey: string): "individual" | "cfd" => {
    if (!isDistributionMetricSeries(seriesKey)) return "individual";
    return seriesSettingsOverrides[seriesKey]?.distributionType ?? "individual";
  };

  const getSeriesCountingMode = (seriesKey: string): "summation" | "unique" => {
    if (!isCountingModeMetricSeries(seriesKey)) return "summation";
    return seriesSettingsOverrides[seriesKey]?.countingMode ?? "summation";
  };

  const getSeriesDataKey = (seriesKey: string): string => {
    if (isDistributionMetricSeries(seriesKey) && getSeriesDistributionType(seriesKey) === "cfd") {
      const countingMode = getSeriesCountingMode(seriesKey);
      return `${seriesKey}::cfd::${countingMode}`;
    }
    if (
      isCountingModeMetricSeries(seriesKey) &&
      getSeriesDistributionType(seriesKey) === "individual" &&
      getSeriesCountingMode(seriesKey) === "unique"
    ) {
      return `${seriesKey}::individual::unique`;
    }
    return seriesKey;
  };

  const signalStatusFlatLineOffsetBySeries = useMemo(() => {
    const stackableSeriesKeys = visibleChartSeries
      .map((series) => series.key)
      .filter((seriesKey) => isSignalLightSeries(seriesKey) && getSeriesShowLine(seriesKey));

    if (stackableSeriesKeys.length <= 1) {
      return new Map<string, number>();
    }

    return new Map(
      stackableSeriesKeys.map((seriesKey, index) => [
        seriesKey,
        index * signalStatusStackStep,
      ])
    );
  }, [visibleChartSeries, seriesSettingsOverrides, signalStatusStackStep]);

  const getSignalStatusFlatLineY = (seriesKey: string, baseY: number): number => {
    return baseY - (signalStatusFlatLineOffsetBySeries.get(seriesKey) ?? 0);
  };

  const getSeriesLabelWithDistribution = (seriesKey: string, label: string): string => {
    if (!isDistributionMetricSeries(seriesKey)) return label;
    if (
      getSeriesDistributionType(seriesKey) === "individual" &&
      isCountingModeMetricSeries(seriesKey)
    ) {
      return getSeriesCountingMode(seriesKey) === "unique" ? `${label} (Unique)` : label;
    }
    if (getSeriesDistributionType(seriesKey) !== "cfd") return label;
    if (isCountingModeMetricSeries(seriesKey)) {
      const countingModeLabel =
        getSeriesCountingMode(seriesKey) === "summation" ? "occupancy" : "unique";
      return `${label} (CFD - ${countingModeLabel})`;
    }
    return `${label} (CFD)`;
  };

  const applyPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);

    if (preset === "all") {
      setFromDate("");
      setToDate("");
      return;
    }

    if (chartData.length === 0) return;

    const endMs = chartData[chartData.length - 1].timestampMs;
    const startMs = endMs - PERIOD_TO_MS[preset];
    setFromDate(toDateInputValue(startMs));
    setToDate(toDateInputValue(endMs));
  };

  useEffect(() => {
    if (dashboardData) {
      applyPreset("all");
    }
  }, [dashboardData]);

  useEffect(() => {
    if (periodPreset !== "all" && chartData.length > 0) {
      applyPreset(periodPreset);
    }
  }, [chartData, periodPreset]);

  const filteredChartData = useMemo(() => {
    if (chartData.length === 0) return [];

    const fromMs = fromDate ? new Date(fromDate).getTime() : Number.NEGATIVE_INFINITY;
    const toMs = toDate ? new Date(toDate).getTime() : Number.POSITIVE_INFINITY;

    return chartData.filter((point) => {
      const inDateRange = point.timestampMs >= fromMs && point.timestampMs <= toMs;
      return inDateRange;
    });
  }, [chartData, fromDate, toDate]);

  const renderedChartData = useMemo(() => {
    if (filteredChartData.length === 0) return [];

    return filteredChartData.map((point) => {
      const nextPoint: ChartPoint = { ...point };
      selectedModesForChart.forEach((mode) => {
        const nsSeriesKey = `${mode}::${NS_LIGHT_SERIES_KEY}`;
        const ewSeriesKey = `${mode}::${EW_LIGHT_SERIES_KEY}`;
        const nsLineY = getSignalStatusFlatLineY(nsSeriesKey, getSignalFlatLineY(nsSeriesKey));
        const ewLineY = getSignalStatusFlatLineY(ewSeriesKey, getSignalFlatLineY(ewSeriesKey));

        const nsStatus = normalizeLightStatus(point[`${mode}::ns_light_status`] ?? point.ns_light_status);
        const ewStatus = normalizeLightStatus(point[`${mode}::ew_light_status`] ?? point.ew_light_status);
        const nsElapsedMs = Number(point[`${mode}::ns_light_elapsed_ms`] ?? point.ns_light_elapsed_ms ?? 0);
        const ewElapsedMs = Number(point[`${mode}::ew_light_elapsed_ms`] ?? point.ew_light_elapsed_ms ?? 0);

        nextPoint[`${mode}::ns_light_status`] = nsStatus ?? null;
        nextPoint[`${mode}::ew_light_status`] = ewStatus ?? null;
        nextPoint[`${mode}::ns_light_elapsed_ms`] = nsElapsedMs;
        nextPoint[`${mode}::ew_light_elapsed_ms`] = ewElapsedMs;

        nextPoint[`${mode}::signal::ns_light::flat::green`] = nsStatus === "green" ? nsLineY : Number.NaN;
        nextPoint[`${mode}::signal::ns_light::flat::yellow`] = nsStatus === "yellow" ? nsLineY : Number.NaN;
        nextPoint[`${mode}::signal::ns_light::flat::red`] = nsStatus === "red" ? nsLineY : Number.NaN;
        nextPoint[`${mode}::signal::ns_light::chart::green`] = nsStatus === "green" ? nsElapsedMs : Number.NaN;
        nextPoint[`${mode}::signal::ns_light::chart::yellow`] = nsStatus === "yellow" ? nsElapsedMs : Number.NaN;
        nextPoint[`${mode}::signal::ns_light::chart::red`] = nsStatus === "red" ? nsElapsedMs : Number.NaN;

        nextPoint[`${mode}::signal::ns_light::max::green`] = Number(point[`${mode}::ns_max_green`] ?? Number.NaN);
        nextPoint[`${mode}::signal::ns_light::min::green`] = Number(point[`${mode}::ns_min_green`] ?? Number.NaN);
        nextPoint[`${mode}::signal::ns_light::max::red`] = Number(point[`${mode}::ns_max_red`] ?? Number.NaN);
        nextPoint[`${mode}::signal::ns_light::min::red`] = Number(point[`${mode}::ns_min_red`] ?? Number.NaN);

        nextPoint[`${mode}::signal::ew_light::max::green`] = Number(point[`${mode}::ew_max_green`] ?? Number.NaN);
        nextPoint[`${mode}::signal::ew_light::min::green`] = Number(point[`${mode}::ew_min_green`] ?? Number.NaN);
        nextPoint[`${mode}::signal::ew_light::max::red`] = Number(point[`${mode}::ew_max_red`] ?? Number.NaN);
        nextPoint[`${mode}::signal::ew_light::min::red`] = Number(point[`${mode}::ew_min_red`] ?? Number.NaN);

        nextPoint[`${mode}::signal::ew_light::flat::green`] = ewStatus === "green" ? ewLineY : Number.NaN;
        nextPoint[`${mode}::signal::ew_light::flat::yellow`] = ewStatus === "yellow" ? ewLineY : Number.NaN;
        nextPoint[`${mode}::signal::ew_light::flat::red`] = ewStatus === "red" ? ewLineY : Number.NaN;
        nextPoint[`${mode}::signal::ew_light::chart::green`] = ewStatus === "green" ? ewElapsedMs : Number.NaN;
        nextPoint[`${mode}::signal::ew_light::chart::yellow`] = ewStatus === "yellow" ? ewElapsedMs : Number.NaN;
        nextPoint[`${mode}::signal::ew_light::chart::red`] = ewStatus === "red" ? ewElapsedMs : Number.NaN;
      });

      return nextPoint;
    });
  }, [filteredChartData, seriesSettingsOverrides, signalStatusFlatLineOffsetBySeries, selectedModesForChart]);

  const xAxisDomain = useMemo<[number, number]>(() => {
    if (filteredChartData.length === 0) {
      return [0, 1];
    }

    const firstStep = filteredChartData[0].step;
    const lastStep = filteredChartData[filteredChartData.length - 1].step;
    return [Math.max(0, firstStep), Math.max(firstStep + 1, lastStep)];
  }, [filteredChartData]);

  const zoomWindowMeta = useMemo(() => {
    const [baseStart, baseEnd] = xAxisDomain;
    const fullRange = Math.max(1, baseEnd - baseStart);
    const zoomedRange = chartZoomLevel <= 1 ? fullRange : Math.max(1, fullRange / chartZoomLevel);
    const defaultStart = baseStart + (fullRange - zoomedRange) / 2;
    const maxStart = Math.max(baseStart, baseEnd - zoomedRange);

    return {
      baseStart,
      baseEnd,
      fullRange,
      zoomedRange,
      defaultStart,
      minStart: baseStart,
      maxStart,
    };
  }, [xAxisDomain, chartZoomLevel]);

  const clampPanOffset = (offset: number): number => {
    if (zoomWindowMeta.zoomedRange >= zoomWindowMeta.fullRange) return 0;
    const minOffset = zoomWindowMeta.minStart - zoomWindowMeta.defaultStart;
    const maxOffset = zoomWindowMeta.maxStart - zoomWindowMeta.defaultStart;
    return Math.min(maxOffset, Math.max(minOffset, offset));
  };

  useEffect(() => {
    setChartPanOffsetMs((current) => clampPanOffset(current));
  }, [zoomWindowMeta]);

  const zoomedXAxisDomain = useMemo<[number, number]>(() => {
    if (chartZoomLevel <= 1) {
      return [zoomWindowMeta.baseStart, zoomWindowMeta.baseEnd];
    }

    const effectiveOffset = clampPanOffset(chartPanOffsetMs);
    let start = zoomWindowMeta.defaultStart + effectiveOffset;
    let end = start + zoomWindowMeta.zoomedRange;

    if (start < zoomWindowMeta.baseStart) {
      end += zoomWindowMeta.baseStart - start;
      start = zoomWindowMeta.baseStart;
    }

    if (end > zoomWindowMeta.baseEnd) {
      start -= end - zoomWindowMeta.baseEnd;
      end = zoomWindowMeta.baseEnd;
    }

    return [Math.max(zoomWindowMeta.baseStart, start), Math.min(zoomWindowMeta.baseEnd, end)];
  }, [chartZoomLevel, chartPanOffsetMs, zoomWindowMeta]);

  const xAxisTicks = useMemo(() => {
    const [domainStart, domainEnd] = zoomedXAxisDomain;
    const totalRange = Math.max(0, domainEnd - domainStart);
    const scaleStep = (xAxisScaleValue * TIME_SCALE_TO_MS[xAxisScaleUnit]) / 1000;
    const totalSteps = Math.floor(totalRange / scaleStep);

    if (totalSteps <= 0) {
      return [domainStart, domainEnd] as number[];
    }

    const MAX_TICKS = 12;
    const stepStride = Math.max(1, Math.ceil((totalSteps + 1) / MAX_TICKS));
    const ticks: number[] = [];

    for (let step = 0; step <= totalSteps; step += stepStride) {
      ticks.push(domainStart + step * scaleStep);
    }

    if (ticks[ticks.length - 1] !== domainEnd) {
      ticks.push(domainEnd);
    }

    return ticks;
  }, [zoomedXAxisDomain, xAxisScaleValue, xAxisScaleUnit]);

  const zoomedRenderedChartData = useMemo(() => {
    const [domainStart, domainEnd] = zoomedXAxisDomain;
    return renderedChartData.filter(
      (point) => point.step >= domainStart && point.step <= domainEnd
    );
  }, [renderedChartData, zoomedXAxisDomain]);

  const zoomedFilteredChartData = useMemo(() => {
    const [domainStart, domainEnd] = zoomedXAxisDomain;
    return filteredChartData.filter(
      (point) => point.step >= domainStart && point.step <= domainEnd
    );
  }, [filteredChartData, zoomedXAxisDomain]);
  const EVENT_COLORS: Record<string, string> = { preemption: "rgba(239, 68, 68, 0.15)", starvation: "rgba(245, 158, 66, 0.15)" };
  const eventSegments = useMemo(() => [] as Array<{ eventType: string; startMs: number; endMs: number }>, []);

  const signalLightSegments = useMemo(() => {
    if (zoomedFilteredChartData.length === 0) return [] as Array<{
      startMs: number;
      endMs: number;
      fill: string;
      seriesKey: string;
      y1?: number;
      y2?: number;
    }>;

    const buildMergedSegments = (
      seriesKey: string,
      getStatus: (point: ChartPoint) => LightStatus | null
    ): Array<{ startMs: number; endMs: number; fill: string; seriesKey: string; y1?: number; y2?: number }> => {
      const merged: Array<{ startMs: number; endMs: number; fill: string; seriesKey: string; y1?: number; y2?: number }> = [];
      const yCenter = getSignalStatusFlatLineY(seriesKey, getSignalFlatLineY(seriesKey));
      const yHalfHeight = signalStatusStackStep / 2 - 0.5;
      const y1 = yCenter - yHalfHeight;
      const y2 = yCenter + yHalfHeight;

      let active: { startMs: number; endMs: number; fill: string } | null = null;

      zoomedFilteredChartData.forEach((point, index) => {
        const nextStep = zoomedFilteredChartData[index + 1]?.step;
        const fallbackEnd = point.step + 1;
        const endMs = Number(nextStep ?? fallbackEnd);
        const status = getStatus(point);

        if (!status) {
          if (active) {
            merged.push({
              startMs: active.startMs,
              endMs: active.endMs,
              fill: active.fill,
              seriesKey,
              y1,
              y2,
            });
            active = null;
          }
          return;
        }

        const fill = LIGHT_BACKGROUND_COLORS[status];

        if (!active) {
          active = { startMs: point.step, endMs, fill };
          return;
        }

        const contiguous = active.endMs === point.step;
        if (active.fill === fill && contiguous) {
          active.endMs = endMs;
          return;
        }

        merged.push({
          startMs: active.startMs,
          endMs: active.endMs,
          fill: active.fill,
          seriesKey,
          y1,
          y2,
        });
        active = { startMs: point.step, endMs, fill };
      });

      const trailingActive = active as { startMs: number; endMs: number; fill: string } | null;
      if (trailingActive !== null) {
        merged.push({
          startMs: trailingActive.startMs,
          endMs: trailingActive.endMs,
          fill: trailingActive.fill,
          seriesKey,
          y1,
          y2,
        });
      }

      return merged;
    };

    const segments: Array<{ startMs: number; endMs: number; fill: string; seriesKey: string }> = [];

    selectedModesForChart.forEach((mode) => {
      const nsKey = `${mode}::${NS_LIGHT_SERIES_KEY}`;
      const ewKey = `${mode}::${EW_LIGHT_SERIES_KEY}`;

      const shouldShowNsBackground =
        showNsLightLine &&
        !deletedSeriesKeys.has(nsKey) &&
        getSeriesShowHighlight(nsKey);

      const shouldShowEwBackground =
        showEwLightLine &&
        !deletedSeriesKeys.has(ewKey) &&
        getSeriesShowHighlight(ewKey);

      if (shouldShowNsBackground) {
        segments.push(
          ...buildMergedSegments(nsKey, (point) =>
            normalizeLightStatus(point[`${mode}::ns_light_status`] ?? point.ns_light_status)
          )
        );
      }

      if (shouldShowEwBackground) {
        segments.push(
          ...buildMergedSegments(ewKey, (point) =>
            normalizeLightStatus(point[`${mode}::ew_light_status`] ?? point.ew_light_status)
          )
        );
      }
    });

    return segments;
  }, [zoomedFilteredChartData, stepDurationMs, showNsLightLine, showEwLightLine, deletedSeriesKeys, seriesSettingsOverrides, selectedModesForChart]);

  const zoomOutDisabled = chartZoomLevel <= 1;
  const zoomInDisabled = chartZoomLevel >= 32;

  const handleZoomIn = () => {
    setChartZoomLevel((current) => Math.min(32, Number((current * 1.5).toFixed(2))));
  };

  const handleZoomOut = () => {
    setChartZoomLevel((current) => {
      if (current <= 1) return 1;
      const next = Number((current / 1.5).toFixed(2));
      return next < 1.05 ? 1 : next;
    });
  };

  const beginChartPan = (clientX: number) => {
    if (chartZoomLevel <= 1) return;
    panStartXRef.current = clientX;
    panStartOffsetRef.current = chartPanOffsetMs;
    setIsChartPanning(true);
  };

  const endChartPan = () => {
    setIsChartPanning(false);
  };

  const updateChartPan = (clientX: number) => {
    if (!isChartPanning || chartZoomLevel <= 1) return;
    const chartWidthPx = chartViewportRef.current?.clientWidth ?? 0;
    if (chartWidthPx <= 0) return;

    const deltaPx = clientX - panStartXRef.current;
    const stepPerPx = zoomWindowMeta.zoomedRange / chartWidthPx;
    const nextOffset = panStartOffsetRef.current - deltaPx * stepPerPx;
    setChartPanOffsetMs(clampPanOffset(nextOffset));
  };

  useEffect(() => {
    if (!isChartPanning) return;

    const handleMouseMove = (event: MouseEvent) => {
      updateChartPan(event.clientX);
    };

    const handleMouseUp = () => {
      endChartPan();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isChartPanning, chartZoomLevel, zoomWindowMeta, chartPanOffsetMs]);

  useEffect(() => {
    if (!isChartPanning) return;

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      updateChartPan(touch.clientX);
      event.preventDefault();
    };

    const handleTouchEnd = () => {
      endChartPan();
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [isChartPanning, chartZoomLevel, zoomWindowMeta, chartPanOffsetMs]);

  const chartRenderKey = `${selectedModesForChart.join("|")}-${activeChartSeries.map((series) => series.key).join("|")}-${chartType}-${xAxisScaleValue}-${xAxisScaleUnit}-${fromDate}-${toDate}-${periodPreset}-${showNsLightLine}-${showEwLightLine}-${xAxisSource}`;

  const chartSpanLabel = useMemo(() => {
    if (filteredChartData.length < 2) return "0s";
    const start = Number(filteredChartData[0].timestampMs);
    const end = Number(filteredChartData[filteredChartData.length - 1].timestampMs);
    return formatDuration(Math.max(0, end - start));
  }, [filteredChartData]);

  useEffect(() => {
    if (!dashboardData) return;

    setChartFlash(true);
    const timer = setTimeout(() => setChartFlash(false), 220);
    return () => clearTimeout(timer);
  }, [
    dashboardData,
    selectedModesForChart,
    modeSelections,
    xAxisScaleValue,
    xAxisScaleUnit,
    chartZoomLevel,
    chartType,
    periodPreset,
    fromDate,
    toDate,
    selectedMetrics,
    showNsLightLine,
    showEwLightLine,
  ]);

  const toggleMetric = (metricKey: string) => {
    setSelectedMetrics((current) => {
      if (current.includes(metricKey)) {
        return current.filter((item) => item !== metricKey);
      }
      return [...current, metricKey];
    });
  };

  const yAxisLabel = useMemo(() => {
    if (selectedMetrics.length === 0) return "";
    const units = new Set<string>();
    selectedMetrics.forEach(key => {
      const option = METRIC_OPTIONS.find(o => o.key === key);
      if (option?.unit) {
        units.add(option.unit);
      } else if ((key.startsWith("p_") || key.includes("ped")) && (key.includes("count") || key.includes("wait") || key.includes("delay") || key.includes("life"))) {
        if (key.includes("count")) units.add("ped");
        else units.add("p_s");
      } else if (key.includes("count") || key.includes("throughput") || key.includes("cleared") || key.includes("queue")) {
        units.add("veh");
      } else if (key.includes("wait") || key.includes("delay") || key.includes("time_loss") || key.includes("life")) {
        units.add("s");
      } else if (key.includes("weight")) {
        units.add("weight");
      } else if (key.includes("qdr")) {
        units.add("rate");
      } else if (key.includes("utilization")) {
        units.add("ratio");
      } else if (key.includes("congestion")) {
        units.add("level");
      } else if (key.includes("threshold")) {
        units.add("%");
      } else if (key.includes("stops") || key.includes("collisions") || key.includes("events") || key.includes("switches") || key.includes("holds") || key.includes("interruptions")) {
        units.add("count");
      }
    });
    if (units.size === 1) {
      const unit = Array.from(units)[0];
      if (unit === "s") {
        const isElapsed = selectedMetrics.some(m => m.toLowerCase().includes("elapsed") || m.toLowerCase().includes("events"));
        if (isElapsed) return "Active Duration (s)";
        return "Demand / Delay (s)";
      }
      if (unit === "p_s") return "Pedestrian Delay (s)";
      if (unit === "veh") return "Vehicle Count";
      if (unit === "ped") return "Pedestrian Count";
      if (unit === "g/s") {
        const isFuel = selectedMetrics.every(m => m.toLowerCase().includes("fuel"));
        const isCO2 = selectedMetrics.every(m => m.toLowerCase().includes("co2"));
        if (isFuel) return "Fuel Consumption (g/s)";
        if (isCO2) return "Emission Rate (CO₂)";
        return "Environmental Metrics (g/s)";
      }
      if (unit === "%") return "Adaptive Threshold (Cost)";
      if (unit === "weight") return "System Weights (s)";
      if (unit === "rate") return "Dissipation Rate (veh/s)";
      if (unit === "ratio") return "Utilization Ratio";
      if (unit === "level") return "Congestion Intensity";
      if (unit === "count") return "Event Count";
      return unit;
    }
    if (units.size > 1) return "Mixed Metrics";
    return "Value";
  }, [selectedMetrics]);

  const handleOverride = async (action: string) => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intersection_id: "center", action }),
      });
      const data = await res.json();
      alert(data.message);
    } catch {
      alert("Failed to send override command");
    }
  };

  if (!isMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-800">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="text-slate-600 dark:text-slate-400 font-medium">Initializing dashboard...</p>
        </div>
      </div>
    );
  }

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
              📈
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight truncate">Traffic Charts</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 font-medium truncate">Multi-modal telemetry analysis and dynamic variable trends.</p>
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
            <Link href="/simulation_data" className="inline-flex items-center rounded-xl border border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-cyan-800 dark:text-cyan-300 transition hover:bg-cyan-100 dark:hover:bg-cyan-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              📊 Simulation Data
            </Link>
            <Link href="/system_help" className="inline-flex items-center rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-purple-800 dark:text-purple-300 transition hover:bg-purple-100 dark:hover:bg-purple-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              📚 System Help
            </Link>
          </div>
        </header>

        {optConfigData && dashboardData?.runType && dashboardData.runType !== "simulation" && (optConfigData.optimized_profile || (optConfigData.optimized_profiles_by_goal && Object.keys(optConfigData.optimized_profiles_by_goal).length > 0)) && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-none">
            {allModes.length > 20 ? (
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

        <section className="relative bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm dark:shadow-none border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Simulation Status</h2>
          <div className="absolute top-6 right-6 flex flex-col items-end text-[10px] sm:text-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="font-semibold uppercase tracking-wider">Last updated:</span>
              <span>{lastUpdatedLabel}</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <span className="font-semibold uppercase tracking-wider">Latest run:</span>
              <span>{latestRunLabel}</span>
            </div>
          </div>

          {error && <div className="text-red-500 bg-red-50 p-4 rounded">Error: {error}</div>}
          {!dashboardData && !error && <div className="text-gray-500 animate-pulse">Loading data...</div>}

          {dashboardData && (
            <div className="space-y-8">

              <div className="space-y-5">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Interactive History Charts</h3>

                <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2 grid-cols-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-inner">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Resolution Interval</span>
                    <input
                      type="number"
                      min={1}
                      value={xAxisScaleValue}
                      onChange={(e) => setXAxisScaleValue(Math.max(1, Number(e.target.value) || 1))}
                      className="rounded-md border border-slate-300 px-3 py-2 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-sky-500 transition"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Interval Unit</span>
                    <select
                      value={xAxisScaleUnit}
                      onChange={(e) => setXAxisScaleUnit(e.target.value as TimeScaleUnit)}
                      className="rounded-md border border-slate-300 px-3 py-2 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-sky-500 transition"
                    >
                      <option value="second">Second</option>
                      <option value="minute">Minute</option>
                      <option value="hour">Hour</option>
                      <option value="day">Day</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Max Samples (DS Precision)</span>
                    <input
                      type="number"
                      min={100}
                      max={10000}
                      step={100}
                      value={maxSamples || ""}
                      onChange={(e) => setMaxSamples(e.target.value === "" ? 0 : Number(e.target.value))}
                      onBlur={() => setMaxSamples((prev) => Math.max(10, prev || 800))}
                      className="rounded-md border border-slate-300 px-3 py-2 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-amber-500 transition"
                      title="Adjust the number of points displayed when Downsampling is ON"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Time Period</span>
                    <select
                      value={periodPreset}
                      onChange={(e) => applyPreset(e.target.value as PeriodPreset)}
                      className="rounded-md border border-slate-300 px-3 py-2 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-sky-500 transition"
                    >
                      <option value="all">All Data</option>
                      <option value="15m">Last 15 Minutes</option>
                      <option value="1h">Last 1 Hour</option>
                      <option value="6h">Last 6 Hours</option>
                    </select>
                  </label>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-700">Simulation Mode Combinations</p>
                    <button
                      type="button"
                      onClick={addModeSelectionRow}
                      className="inline-flex items-center rounded-md border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-sm font-medium text-cyan-800 transition hover:bg-cyan-100"
                    >
                      + Add To Charts
                    </button>
                  </div>

                  <div className="space-y-3">
                    {resolvedModeSelections.map((item, index) => {
                      const selection = item.selection;

                      return (
                        <div key={item.id} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                              Combination {index + 1}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeModeSelectionRow(item.id)}
                              disabled={modeSelections.length <= 1}
                              className="inline-flex items-center rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2 grid-cols-1">
                            <label className="flex flex-col gap-1 w-full">
                              <span className="text-sm font-medium text-slate-700">Mode</span>
                              <select
                                value={selection.simulationMode}
                                onChange={(e) => updateModeSelection(item.id, "simulationMode", e.target.value as "Fixed" | "Adaptive")}
                                className="rounded-md border border-slate-300 px-3 py-2 bg-white dark:bg-slate-900 text-sm w-full"
                              >
                                <option value="Fixed">Fixed</option>
                                <option value="Adaptive">Adaptive</option>
                              </select>
                            </label>

                            <div className="flex flex-col gap-1 w-full">
                              <span className="text-sm font-medium text-slate-700">Preemption</span>
                              <div className="flex rounded-md border border-slate-300 overflow-hidden w-full">
                                <button
                                  type="button"
                                  onClick={() => updateModeSelection(item.id, "preemptionEnabled", false)}
                                  className={`flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium text-center transition ${!selection.preemptionEnabled
                                    ? "bg-slate-700 text-white shadow-inner"
                                    : "bg-white dark:bg-slate-900 text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    }`}
                                >
                                  Off
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateModeSelection(item.id, "preemptionEnabled", true)}
                                  className={`flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium text-center border-l border-slate-300 transition ${selection.preemptionEnabled
                                    ? "bg-emerald-600 text-white shadow-inner"
                                    : "bg-white dark:bg-slate-900 text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    }`}
                                >
                                  Preemption
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-col gap-1 w-full">
                              <span className="text-sm font-medium text-slate-700">Priority System</span>
                              <div className={`flex rounded-md border overflow-hidden w-full ${selection.simulationMode === "Adaptive" ? "border-slate-300" : "border-slate-200 dark:border-slate-700"}`}>
                                <button
                                  type="button"
                                  onClick={() => updateModeSelection(item.id, "priorityEnabled", false)}
                                  disabled={selection.simulationMode !== "Adaptive"}
                                  className={`flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium text-center transition ${selection.simulationMode === "Adaptive"
                                    ? !selection.priorityEnabled
                                      ? "bg-slate-700 text-white shadow-inner"
                                      : "bg-white dark:bg-slate-900 text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    : "bg-slate-100 dark:bg-slate-950 text-slate-400 cursor-not-allowed"
                                    }`}
                                >
                                  Off
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateModeSelection(item.id, "priorityEnabled", true)}
                                  disabled={selection.simulationMode !== "Adaptive"}
                                  className={`flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium text-center border-l transition ${selection.simulationMode === "Adaptive" ? "border-slate-300" : "border-slate-200 dark:border-slate-700"} ${selection.simulationMode === "Adaptive"
                                    ? selection.priorityEnabled
                                      ? "bg-indigo-600 text-white shadow-inner"
                                      : "bg-white dark:bg-slate-900 text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    : "bg-slate-100 dark:bg-slate-950 text-slate-400 cursor-not-allowed"
                                    }`}
                                >
                                  Weighted
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-col gap-1 w-full">
                              <span className="text-sm font-medium text-slate-700">Optimization Profile</span>
                              <div className="flex items-center h-[38px] px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider overflow-hidden truncate">
                                {(() => {
                                  const isConfigOptimized = dashboardData?.runType && dashboardData.runType !== "simulation" && (selection.optimized || (
                                    optConfigData?.optimized_profile && (
                                      item.mode?.toLowerCase() === optConfigData.optimized_profile.name?.replace(/_/g, " ").toLowerCase() ||
                                      item.mode?.toLowerCase() === optConfigData.optimized_profile.base_config?.replace(/_/g, " ").toLowerCase()
                                    )
                                  ));
                                  const goalLabel = selection.goalKey && selection.goalKey !== "baseline"
                                    ? selection.goalKey.replace(/_/g, " ")
                                    : (optConfigData?.optimized_profiles_by_goal
                                      ? Object.entries(optConfigData.optimized_profiles_by_goal).find(([k, v]: any) => v.timestamp === optConfigData?.optimized_profile?.timestamp || v.name === optConfigData?.optimized_profile?.name)?.[0]?.replace(/_/g, " ")
                                      : "Balanced");

                                  return isConfigOptimized ? (
                                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5 truncate">
                                      <span>🌟</span> Optimized {goalLabel ? `(${goalLabel})` : ""}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1.5 truncate">
                                      <span>🎯</span> Standard
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {(unresolvedModeCount > 0 || duplicateModeCount > 0) && (
                    <div className="mt-3 space-y-1">
                      {unresolvedModeCount > 0 && (
                        <p className="text-xs font-medium text-amber-700">
                          {unresolvedModeCount} combination{unresolvedModeCount === 1 ? "" : "s"} could not be mapped to available dataset names.
                        </p>
                      )}
                      {duplicateModeCount > 0 && (
                        <p className="text-xs font-medium text-amber-700">
                          {duplicateModeCount} duplicate combination{duplicateModeCount === 1 ? "" : "s"} detected. Duplicate modes are shown once on chart.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {matrixData?.goals && Object.keys(matrixData.goals).length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 shadow-sm">
                    <div className="mb-6 border-b border-slate-200 dark:border-slate-700 pb-4">
                      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span>🏆</span> 48-Mode Benchmark Arena Apex Winners
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Quickly view the winning controller mode for each optimization goal and add their timelines directly to the comparison chart below.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {Object.entries(matrixData.goals).map(([gKey, gObj]: [string, any]) => {
                        const apexWinnerKey = getApexWinnerForGoal(gKey, gObj.configurations || {});
                        const cData = gObj.configurations?.[apexWinnerKey] || {};
                        const veh = cData.vehicle || {};

                        return (
                          <div key={gKey} className="flex flex-col justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm transition hover:shadow-md">
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  {gObj.display_name || gKey.replace(/_/g, " ").toUpperCase()}
                                </span>
                                {gKey !== "baseline" && (
                                  <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                    Optimized
                                  </span>
                                )}
                              </div>
                              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 min-h-[2.5rem] flex items-center">
                                {formatWinnerModeName(apexWinnerKey)}
                              </h3>

                              <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-600 dark:text-slate-300 mb-4">
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-slate-400">Avg Delay:</span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">{Number(veh["Average Delay (s)"] ?? 0).toFixed(2)}s</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-slate-400">Throughput:</span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">{Number(veh["throughput"] ?? veh["Count"] ?? veh["Total Vehicles"] ?? 0).toFixed(0)} veh</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-slate-400">Avg CO2:</span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">{Number(veh["Avg CO2 (g)"] ?? 0).toFixed(1)}g</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 dark:text-slate-400">Starvation:</span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">{Number(veh["Starvation Events"] ?? 0)} events</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => addWinnerToChart(apexWinnerKey, gKey)}
                              className="w-full flex items-center justify-center gap-1.5 rounded-md bg-slate-900 dark:bg-slate-100 px-3 py-2 text-xs font-semibold text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-200 shadow-sm"
                            >
                              <span>➕</span> Add Winner Chart
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
                  <div className="mb-6 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-4">
                    <div>
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-200">Variables & Analytics</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Select metrics to plot on the timeline</p>
                    </div>
                    {(!directionAvailability.nsAxis || !directionAvailability.ewAxis) && (
                      <span className={UNAVAILABLE_BADGE_CLASS}>{UNAVAILABLE_LABEL}</span>
                    )}
                  </div>

                  <div className="flex flex-col lg:flex-row gap-8">

                    <div className="lg:w-64 flex-shrink-0 space-y-1.5">
                      <p className="px-4 mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        Metric Categories
                      </p>
                      {METRIC_SECTIONS.map((section) => (
                        <button
                          key={section.id}
                          onClick={() => setActiveMetricTab(section.id)}
                          className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all group ${activeMetricTab === section.id
                            ? "bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 shadow-sm shadow-sky-500/5"
                            : "bg-transparent border border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                            }`}
                        >
                          <span className={`font-bold text-xs uppercase tracking-widest transition-transform duration-300 ${activeMetricTab === section.id ? "translate-x-1" : "group-hover:translate-x-1"}`}>
                            {section.title}
                          </span>
                          {activeMetricTab === section.id && (
                            <div className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="flex-1 min-h-[400px]">
                      {METRIC_SECTIONS.filter(s => s.id === activeMetricTab).map((section) => (
                        <section key={section.id} className="animate-in fade-in slide-in-from-right-4 duration-500 h-full">
                          <div className="mb-6 flex flex-col gap-1 border-l-2 border-sky-500 pl-4">
                            <h3 className="text-base font-bold uppercase tracking-[0.15em] text-slate-800 dark:text-slate-200">
                              {section.title}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                              {section.subtitle}
                            </p>
                          </div>

                          {section.id === "operations" ? (
                            <div className="flex flex-col xl:flex-row gap-6">

                              <div className="xl:flex-[1.2] h-full">
                                {section.groups
                                  .filter(title => title === "Vehicle Composition")
                                  .map((groupTitle) => {
                                    const group = METRIC_GROUPS.find((g) => g.title === groupTitle);
                                    if (!group) return null;
                                    const groupedMetrics = group.metricKeys
                                      .map((key) => METRIC_OPTIONS.find((metric) => metric.key === key))
                                      .filter((metric): metric is MetricOption => Boolean(metric));

                                    return (
                                      <div key={group.title} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-6 shadow-sm hover:shadow-md transition-all border-t-4 border-t-sky-500 h-full">
                                        <p className="mb-6 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-500">
                                          {group.title}
                                        </p>
                                        <div className="space-y-4">
                                          {groupedMetrics.map((metric) => (
                                            <label
                                              key={metric.key}
                                              className={`flex items-center gap-4 text-sm transition-all group cursor-pointer ${isMetricAvailableByLayout(metric.key, directionAvailability)
                                                ? "text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400"
                                                : "text-slate-400 cursor-not-allowed opacity-50"
                                                }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={selectedMetrics.includes(metric.key)}
                                                onChange={() => toggleMetric(metric.key)}
                                                disabled={!isMetricAvailableByLayout(metric.key, directionAvailability)}
                                                className="h-5 w-5 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500 accent-sky-500"
                                              />
                                              <span className="flex-1 line-clamp-1 font-semibold">{metric.label}</span>
                                              <div
                                                className="h-2.5 w-2.5 rounded-full shadow-[0_0_8px_currentColor]"
                                                style={{ backgroundColor: metric.color, color: metric.color }}
                                              />
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>

                              <div className="xl:flex-1 flex flex-col gap-6">
                                {section.groups
                                  .filter(title => title !== "Vehicle Composition")
                                  .map((groupTitle) => {
                                    const group = METRIC_GROUPS.find((g) => g.title === groupTitle);
                                    if (!group) return null;
                                    const groupedMetrics = group.metricKeys
                                      .map((key) => METRIC_OPTIONS.find((metric) => metric.key === key))
                                      .filter((metric): metric is MetricOption => Boolean(metric));

                                    return (
                                      <div key={group.title} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-5 shadow-sm hover:shadow-md transition-all border-t-4 border-t-slate-100 dark:border-t-slate-800">
                                        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
                                          {group.title}
                                        </p>
                                        <div className="space-y-3">
                                          {groupedMetrics.map((metric) => (
                                            <label
                                              key={metric.key}
                                              className={`flex items-center gap-3 text-sm transition-all group cursor-pointer ${isMetricAvailableByLayout(metric.key, directionAvailability)
                                                ? "text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400"
                                                : "text-slate-400 cursor-not-allowed opacity-50"
                                                }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={selectedMetrics.includes(metric.key)}
                                                onChange={() => toggleMetric(metric.key)}
                                                disabled={!isMetricAvailableByLayout(metric.key, directionAvailability)}
                                                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500 accent-sky-500"
                                              />
                                              <span className="flex-1 line-clamp-1 font-medium">{metric.label}</span>
                                              <div
                                                className="h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]"
                                                style={{ backgroundColor: metric.color, color: metric.color }}
                                              />
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
                              {section.groups.map((groupTitle) => {
                                const group = METRIC_GROUPS.find((g) => g.title === groupTitle);
                                if (!group) return null;

                                const groupedMetrics = group.metricKeys
                                  .map((key) => METRIC_OPTIONS.find((metric) => metric.key === key))
                                  .filter((metric): metric is MetricOption => Boolean(metric));

                                return (
                                  <div key={group.title} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-5 shadow-sm hover:shadow-md transition-all border-t-4 border-t-slate-100 dark:border-t-slate-800">
                                    <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-600/80 dark:text-sky-500/80">
                                      {group.title}
                                    </p>

                                    <div className="space-y-3">
                                      {group.includeLightStatus && (
                                        <div className="flex flex-col gap-2.5 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                                          <label
                                            className={`flex items-center gap-3 text-sm font-normal transition-opacity ${directionAvailability.nsAxis ? "text-slate-700 dark:text-slate-200" : "text-slate-400 opacity-50"
                                              }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={showNsLightLine}
                                              onChange={() => setShowNsLightLine((current) => !current)}
                                              disabled={!directionAvailability.nsAxis}
                                              className="h-4 w-4 accent-sky-500 rounded border-slate-300 dark:border-slate-600"
                                            />
                                            <span>
                                              NS Light Phase
                                              {!directionAvailability.nsAxis ? ` (${UNAVAILABLE_LABEL})` : ""}
                                            </span>
                                          </label>
                                          <label
                                            className={`flex items-center gap-3 text-sm font-normal transition-opacity ${directionAvailability.ewAxis ? "text-slate-700 dark:text-slate-200" : "text-slate-400 opacity-50"
                                              }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={showEwLightLine}
                                              onChange={() => setShowEwLightLine((current) => !current)}
                                              disabled={!directionAvailability.ewAxis}
                                              className="h-4 w-4 accent-sky-500 rounded border-slate-300 dark:border-slate-600"
                                            />
                                            <span>
                                              EW Light Phase
                                              {!directionAvailability.ewAxis ? ` (${UNAVAILABLE_LABEL})` : ""}
                                            </span>
                                          </label>
                                        </div>
                                      )}

                                      {groupedMetrics.map((metric) => (
                                        <label
                                          key={metric.key}
                                          className={`flex items-center gap-3 text-sm transition-all group cursor-pointer ${isMetricAvailableByLayout(metric.key, directionAvailability)
                                            ? "text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400"
                                            : "text-slate-400 cursor-not-allowed opacity-50"
                                            }`}
                                        >
                                          <div className="relative flex items-center">
                                            <input
                                              type="checkbox"
                                              checked={selectedMetrics.includes(metric.key)}
                                              onChange={() => toggleMetric(metric.key)}
                                              disabled={!isMetricAvailableByLayout(metric.key, directionAvailability)}
                                              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500 accent-sky-500"
                                            />
                                          </div>
                                          <span className="flex-1 line-clamp-1 font-medium">{metric.label}</span>
                                          <div
                                            className="h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]"
                                            style={{ backgroundColor: metric.color, color: metric.color }}
                                          />
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  </div>
                </div>

                {
                  !hasAnyModeData ? (
                    <div className="text-amber-700 bg-amber-50 p-4 rounded border border-amber-200">
                      No data available for the selected chart mode selection.
                    </div>
                  ) : (
                    <>
                      <div
                        ref={chartViewportRef}
                        onMouseDown={(e) => beginChartPan(e.clientX)}
                        onTouchStart={(e) => {
                          if (chartZoomLevel <= 1) return;
                          const touch = e.touches[0];
                          if (!touch) return;
                          beginChartPan(touch.clientX);
                          e.preventDefault();
                        }}
                        onTouchMove={(e) => {
                          if (!isChartPanning) return;
                          const touch = e.touches[0];
                          if (!touch) return;
                          updateChartPan(touch.clientX);
                          e.preventDefault();
                        }}
                        onTouchEnd={endChartPan}
                        onTouchCancel={endChartPan}
                        style={{ touchAction: chartZoomLevel > 1 ? "none" : "auto" }}
                        className={`relative h-[420px] w-full bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden ${chartZoomLevel > 1 ? (isChartPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
                          }`}
                      >
                        <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-md border border-slate-300 bg-white dark:bg-slate-900/95 p-1 shadow-sm dark:shadow-none">
                          <button
                            type="button"
                            onClick={() => setDownsampleEnabled(!downsampleEnabled)}
                            className={`inline-flex h-7 px-2 items-center justify-center rounded border text-[10px] font-bold uppercase tracking-wider transition ${!downsampleEnabled
                              ? "bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200"
                              : "border-slate-300 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-100"
                              }`}
                            title={downsampleEnabled ? "Disable Downsampling (High Precision)" : "Enable Downsampling (Better Performance)"}
                          >
                            {downsampleEnabled ? "DS: ON" : "DS: OFF"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTooltipEnabled(!tooltipEnabled)}
                            className={`inline-flex h-7 px-2 items-center justify-center rounded border text-[10px] font-bold uppercase tracking-wider transition ${!tooltipEnabled
                              ? "bg-rose-100 border-rose-300 text-rose-700 hover:bg-rose-200"
                              : "border-slate-300 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-100"
                              }`}
                            title={tooltipEnabled ? "Disable Mouse Hover Tooltip" : "Enable Mouse Hover Tooltip"}
                          >
                            {tooltipEnabled ? "Hover: ON" : "Hover: OFF"}
                          </button>
                          <div className="w-[1px] h-4 bg-slate-200 mx-1" />
                          <button
                            type="button"
                            onClick={handleZoomOut}
                            disabled={zoomOutDisabled}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded border text-sm font-semibold transition ${zoomOutDisabled
                              ? "cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 text-slate-400"
                              : "border-slate-300 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-950"
                              }`}
                            title="Zoom out"
                            aria-label="Zoom out chart"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={handleZoomIn}
                            disabled={zoomInDisabled}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded border text-sm font-semibold transition ${zoomInDisabled
                              ? "cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 text-slate-400"
                              : "border-slate-300 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-950"
                              }`}
                            title="Zoom in"
                            aria-label="Zoom in chart"
                          >
                            +
                          </button>
                          <div className="relative" ref={xAxisSourceMenuRef}>
                            <button
                              type="button"
                              onClick={() => setShowXAxisSourceMenu(!showXAxisSourceMenu)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition hover:bg-slate-100 dark:bg-slate-950"
                              title="X-axis source settings"
                              aria-label="X-axis source settings"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="1" />
                                <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
                              </svg>
                            </button>
                            {showXAxisSourceMenu && (
                              <div className="absolute right-0 top-full mt-2 rounded-md border border-slate-300 bg-white dark:bg-slate-900 shadow-lg z-30">
                                <div className="px-3 py-2 text-sm font-semibold text-slate-700 border-b border-slate-200 dark:border-slate-700">
                                  X-axis source
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setXAxisSource("timeCounter");
                                    setShowXAxisSourceMenu(false);
                                  }}
                                  className={`block w-full text-left px-3 py-2 text-sm transition ${xAxisSource === "timeCounter"
                                    ? "bg-blue-100 text-blue-900 font-semibold"
                                    : "text-slate-700 hover:bg-slate-100 dark:bg-slate-950"
                                    }`}
                                >
                                  Time Counter
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setXAxisSource("realTimeline");
                                    setShowXAxisSourceMenu(false);
                                  }}
                                  className={`block w-full text-left px-3 py-2 text-sm transition ${xAxisSource === "realTimeline"
                                    ? "bg-blue-100 text-blue-900 font-semibold"
                                    : "text-slate-700 hover:bg-slate-100 dark:bg-slate-950"
                                    }`}
                                >
                                  Real Timeline
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div
                          className={`pointer-events-none absolute inset-0 bg-cyan-100 transition-opacity duration-200 ${chartFlash ? "opacity-35" : "opacity-0"}`}
                        />
                        {activeChartSeries.length === 0 ? (
                          <div className="flex h-full w-full items-center justify-center text-slate-500 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                            <div className="text-center p-8">
                              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
                              </div>
                              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No Metrics Selected</h3>
                              <p className="text-sm max-w-xs mx-auto">Please select one or more metrics from the sections above to begin visualizing traffic data.</p>
                            </div>
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart key={chartRenderKey} data={zoomedRenderedChartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              {signalLightSegments.map((segment, index) => (
                                <ReferenceArea
                                  key={`signal-light-${segment.seriesKey}-${index}-${segment.startMs}`}
                                  x1={segment.startMs}
                                  x2={segment.endMs}
                                  fill={segment.fill}
                                  ifOverflow="visible"
                                />
                              ))}
                              {eventSegments.map((segment, index) => (
                                <ReferenceArea
                                  key={`mixed-event-${segment.eventType}-${index}-${segment.startMs}`}
                                  x1={segment.startMs}
                                  x2={segment.endMs}
                                  fill={EVENT_COLORS[segment.eventType]}
                                  ifOverflow="visible"
                                />
                              ))}
                              <XAxis
                                type="number"
                                dataKey="step"
                                domain={zoomedXAxisDomain}
                                allowDataOverflow
                                ticks={xAxisTicks}
                                tick={{ fontSize: 11 }}
                                tickMargin={10}
                                tickFormatter={(value) => {
                                  if ((xAxisSource === "realTimeline" || isStreamMode) && baseMs > 0) {
                                    const date = new Date(baseMs + Number(value) * 1000);
                                    const monthDay = date.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
                                    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
                                    return `${monthDay} ${time}`;
                                  }
                                  return formatTimeLabel(Number(value), xAxisScaleUnit);
                                }}
                              />
                              <YAxis tick={{ fontSize: 11 }}>
                                <Label
                                  value={yAxisLabel}
                                  angle={-90}
                                  position="insideLeft"
                                  style={{ textAnchor: 'middle', fontSize: '11px', fill: '#64748b', fontWeight: 600 }}
                                />
                              </YAxis>
                              <Tooltip
                                content={({ active, label, payload }) => {
                                  if (!tooltipEnabled || !active || !payload || payload.length === 0) return null;

                                  const point = payload[0]?.payload as ChartPoint | undefined;
                                  const globalRows = payload.filter((entry) => {
                                    const dataKey = String(entry.dataKey ?? "");
                                    return !dataKey.includes("signal::");
                                  });

                                  const modeRows = selectedModesForChart.flatMap((mode) => {
                                    const nsStatus = normalizeLightStatus(point?.[`${mode}::ns_light_status`] ?? point?.ns_light_status);
                                    const ewStatus = normalizeLightStatus(point?.[`${mode}::ew_light_status`] ?? point?.ew_light_status);
                                    const nsElapsedMs = Number(point?.[`${mode}::ns_light_elapsed_ms`] ?? point?.ns_light_elapsed_ms ?? 0);
                                    const ewElapsedMs = Number(point?.[`${mode}::ew_light_elapsed_ms`] ?? point?.ew_light_elapsed_ms ?? 0);

                                    return [
                                      <div key={`${mode}-ns`} className="flex items-center justify-between gap-4 text-sm font-medium" style={{ color: getLightTextColor(nsStatus) }}>
                                        <span>NS Light ({mode})</span>
                                        <span className="font-semibold">{formatSignalElapsed(nsStatus, nsElapsedMs)}</span>
                                      </div>,
                                      <div key={`${mode}-ew`} className="flex items-center justify-between gap-4 text-sm font-medium" style={{ color: getLightTextColor(ewStatus) }}>
                                        <span>EW Light ({mode})</span>
                                        <span className="font-semibold">{formatSignalElapsed(ewStatus, ewElapsedMs)}</span>
                                      </div>,
                                    ].filter(Boolean);
                                  });

                                  return (
                                    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-lg">
                                      <p className="mb-2 text-xs font-semibold text-slate-700">
                                        {typeof label === "number"
                                          ? ((isStreamMode || xAxisSource === "realTimeline") && baseMs > 0
                                            ? new Date(baseMs + label * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })
                                            : formatTimeLabel(label, xAxisScaleUnit))
                                          : String(label ?? "")}
                                      </p>

                                      <div className="flex gap-6">

                                        {globalRows.length > 0 && (
                                          <div className="flex flex-col gap-1.5 min-w-[200px]">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 border-b border-slate-100 dark:border-slate-800 pb-1">
                                              Metrics
                                            </p>
                                            {globalRows.map((entry, index) => (
                                              <div
                                                key={`${String(entry.dataKey ?? entry.name ?? entry.color ?? "row")}-${index}`}
                                                className="flex items-center justify-between gap-4 text-xs text-slate-700"
                                                style={{ color: entry.color ?? "#334155" }}
                                              >
                                                <span className="font-medium">{entry.name ?? String(entry.dataKey ?? "Value")}</span>
                                                <span className="font-bold">
                                                  {typeof entry.value === "number" ? (Number.isInteger(entry.value) ? entry.value : entry.value.toFixed(3)) : String(entry.value ?? "")}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        {modeRows.length > 0 && (
                                          <div className="flex flex-col gap-1.5 min-w-[200px] border-l border-slate-100 dark:border-slate-800 pl-6">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 border-b border-slate-100 dark:border-slate-800 pb-1">
                                              Signal Status
                                            </p>
                                            {modeRows}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                              {visibleChartSeries.map((series) => {
                                const seriesStyle = getSeriesStyle(series);
                                const resolvedChartType = getSeriesChartType(series.key);

                                if (isSignalLightSeries(series.key)) {
                                  const colorKeys: LightStatus[] = ["green", "yellow", "red"];
                                  return (
                                    <Fragment key={series.key}>
                                      {getSeriesShowLine(series.key) &&
                                        colorKeys.map((status, index) => (
                                          <Line
                                            key={`${series.key}-flat-${status}`}
                                            type="linear"
                                            dataKey={`${series.key}::flat::${status}`}
                                            name={index === 0 ? `${series.label} (Flat)` : undefined}
                                            legendType={index === 0 ? "line" : "none"}
                                            stroke={LIGHT_LINE_COLORS[status]}
                                            strokeWidth={seriesStyle.lineWidth}
                                            dot={false}
                                            connectNulls={false}
                                            isAnimationActive={false}
                                          />
                                        ))}

                                      {getSeriesShowChart(series.key) &&
                                        colorKeys.map((status, index) => (
                                          <Line
                                            key={`${series.key}-chart-${status}`}
                                            type="linear"
                                            dataKey={`${series.key}::chart::${status}`}
                                            name={index === 0 ? `${series.label} (Chart)` : undefined}
                                            legendType={index === 0 ? "line" : "none"}
                                            stroke={LIGHT_LINE_COLORS[status]}
                                            strokeWidth={Math.max(0.5, seriesStyle.lineWidth - 0.5)}
                                            dot={false}
                                            connectNulls={false}
                                            isAnimationActive={false}
                                          />
                                        ))}

                                      {(getSeriesShowMinChart(series.key) || getSeriesShowMaxChart(series.key)) && (
                                        <>
                                          {getSeriesShowMaxChart(series.key) && (
                                            <Line
                                              key={`${series.key}-max-green`}
                                              type="stepAfter"
                                              dataKey={`${series.key}::max::green`}
                                              name={`${series.label} Max Green`}
                                              stroke={LIGHT_LINE_COLORS.green}
                                              strokeWidth={2}
                                              strokeDasharray="8 4"
                                              dot={false}
                                              connectNulls={true}
                                              isAnimationActive={false}
                                            />
                                          )}
                                          {getSeriesShowMinChart(series.key) && (
                                            <Line
                                              key={`${series.key}-min-green`}
                                              type="stepAfter"
                                              dataKey={`${series.key}::min::green`}
                                              name={`${series.label} Min Green`}
                                              stroke={LIGHT_LINE_COLORS.green}
                                              strokeWidth={2}
                                              strokeDasharray="3 3"
                                              dot={false}
                                              connectNulls={true}
                                              isAnimationActive={false}
                                            />
                                          )}
                                          {getSeriesShowMaxChart(series.key) && (
                                            <Line
                                              key={`${series.key}-max-red`}
                                              type="stepAfter"
                                              dataKey={`${series.key}::max::red`}
                                              name={`${series.label} Max Red`}
                                              stroke={LIGHT_LINE_COLORS.red}
                                              strokeWidth={2}
                                              strokeDasharray="8 4"
                                              dot={false}
                                              connectNulls={true}
                                              isAnimationActive={false}
                                            />
                                          )}
                                          {getSeriesShowMinChart(series.key) && (
                                            <Line
                                              key={`${series.key}-min-red`}
                                              type="stepAfter"
                                              dataKey={`${series.key}::min::red`}
                                              name={`${series.label} Min Red`}
                                              stroke={LIGHT_LINE_COLORS.red}
                                              strokeWidth={2}
                                              strokeDasharray="3 3"
                                              dot={false}
                                              connectNulls={true}
                                              isAnimationActive={false}
                                            />
                                          )}
                                        </>
                                      )}
                                    </Fragment>
                                  );
                                }

                                if (resolvedChartType === "step") {
                                  return (
                                    <Line
                                      key={series.key}
                                      type="stepAfter"
                                      dataKey={getSeriesDataKey(series.key)}
                                      name={getSeriesLabelWithDistribution(series.key, series.label)}
                                      stroke={seriesStyle.color}
                                      strokeWidth={seriesStyle.lineWidth}
                                      strokeDasharray={seriesStyle.dashPattern}
                                      opacity={Math.max(0.45, 1 - series.modeIndex * 0.08)}
                                      dot={false}
                                      isAnimationActive={false}
                                      connectNulls={true}
                                    />
                                  );
                                }
                                if (resolvedChartType === "area") {
                                  return (
                                    <Area
                                      key={series.key}
                                      type="monotone"
                                      dataKey={getSeriesDataKey(series.key)}
                                      name={getSeriesLabelWithDistribution(series.key, series.label)}
                                      stroke={seriesStyle.color}
                                      strokeWidth={seriesStyle.lineWidth}
                                      strokeDasharray={seriesStyle.dashPattern}
                                      fill={seriesStyle.color}
                                      fillOpacity={activeMetrics.length === 1 ? 0.14 : Math.max(0.06, 0.18 - series.modeIndex * 0.02)}
                                      isAnimationActive={false}
                                    />
                                  );
                                }
                                if (resolvedChartType === "bar") {
                                  return (
                                    <Bar
                                      key={series.key}
                                      dataKey={getSeriesDataKey(series.key)}
                                      name={getSeriesLabelWithDistribution(series.key, series.label)}
                                      fill={seriesStyle.color}
                                      fillOpacity={activeMetrics.length === 1 ? Math.max(0.35, 0.9 - series.modeIndex * 0.08) : Math.max(0.3, 0.85 - series.modeIndex * 0.06)}
                                      radius={[3, 3, 0, 0]}
                                      isAnimationActive={false}
                                    />
                                  );
                                }

                                return (
                                  <Line
                                    key={series.key}
                                    type="monotone"
                                    dataKey={getSeriesDataKey(series.key)}
                                    name={getSeriesLabelWithDistribution(series.key, series.label)}
                                    stroke={seriesStyle.color}
                                    strokeWidth={seriesStyle.lineWidth}
                                    strokeDasharray={seriesStyle.dashPattern}
                                    opacity={Math.max(0.45, 1 - series.modeIndex * 0.08)}
                                    dot={false}
                                    isAnimationActive={false}
                                  />
                                );
                              })}
                            </ComposedChart>
                          </ResponsiveContainer>
                        )}
                      </div>

                      {activeChartSeries.length > 0 && (
                        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                              Selected Lines Legend
                            </p>
                            <button
                              type="button"
                              onClick={undoLastDelete}
                              disabled={deletedSeriesHistory.length === 0}
                              className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition ${deletedSeriesHistory.length === 0
                                ? "cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 text-slate-400"
                                : "border-cyan-300 bg-cyan-50 text-cyan-800 hover:bg-cyan-100"
                                }`}
                            >
                              Undo last delete
                            </button>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {activeChartSeries.map((series) => {
                              const seriesStyle = getSeriesStyle(series);
                              const seriesChartType = getSeriesChartType(series.key);

                              return (
                                <div
                                  key={`series-legend-${series.key}`}
                                  className={`inline-flex items-center gap-1 rounded-md border pr-1 ${hiddenSeries.has(series.key)
                                    ? "border-slate-300 bg-slate-200 text-slate-500 opacity-50"
                                    : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700"
                                    }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleSeriesVisibility(series.key)}
                                    className="inline-flex items-center gap-2 rounded-l-md px-2.5 py-1 text-xs transition hover:bg-slate-100 dark:bg-slate-950"
                                  >
                                    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true" className="shrink-0">
                                      {seriesChartType === "bar" ? (
                                        <rect x="4" y="2" width="4" height="6" fill={seriesStyle.color} />
                                      ) : seriesChartType === "step" ? (
                                        <path d="M1 8 L9 8 L9 2 L17 2 L17 8 L27 8" fill="none" stroke={seriesStyle.color} strokeWidth={String(seriesStyle.lineWidth)} />
                                      ) : seriesChartType === "area" ? (
                                        <>
                                          <path d="M1 8 L1 5 L9 4 L17 6 L27 2 L27 8 Z" fill={seriesStyle.color} fillOpacity="0.22" />
                                          <path d="M1 5 L9 4 L17 6 L27 2" fill="none" stroke={seriesStyle.color} strokeWidth={String(Math.max(0.5, seriesStyle.lineWidth - 0.4))} strokeDasharray={seriesStyle.dashPattern} />
                                        </>
                                      ) : (
                                        <line
                                          x1="1"
                                          y1="5"
                                          x2="27"
                                          y2="5"
                                          stroke={seriesStyle.color}
                                          strokeWidth={String(seriesStyle.lineWidth)}
                                          strokeDasharray={seriesStyle.dashPattern}
                                          strokeLinecap="round"
                                        />
                                      )}
                                    </svg>
                                    <span>{series.label}</span>
                                    {isSignalLightSeries(series.key) && !getSeriesShowLine(series.key) && (
                                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                        line off
                                      </span>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setStyleEditorSeriesKey(series.key)}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 bg-white dark:bg-slate-900 text-slate-700 transition hover:bg-slate-100 dark:bg-slate-950"
                                    aria-label={`Open style settings for ${series.label}`}
                                    title="Style settings"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <circle cx="12" cy="12" r="3" />
                                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-[11px] text-slate-500">
                            Click any item to hide/show it on the chart, or use the gear icon to change series type and color.
                          </p>
                        </div>
                      )}

                      {filteredChartData.length === 0 && (
                        <div className="text-amber-700 bg-amber-50 p-4 rounded border border-amber-200">
                          No data points found in the selected date and time range.
                        </div>
                      )}
                    </>
                  )
                }
              </div>

              {dashboardData.history && dashboardData.history.length === 0 && (
                <div className="text-gray-500 bg-gray-50 p-4 rounded">
                  History data is available but empty for this run.
                </div>
              )}
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

      {styleEditorSeries && styleEditorSeriesKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Style Settings</p>
              <button
                type="button"
                onClick={() => setStyleEditorSeriesKey(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white dark:bg-slate-900 text-slate-700 hover:bg-slate-100 dark:bg-slate-950"
                aria-label="Close style editor"
              >
                x
              </button>
            </div>

            <p className="mb-3 text-xs font-medium text-slate-700">{styleEditorSeries.label}</p>

            <label className="mb-3 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">Series Type</span>
              <select
                value={getSeriesChartType(styleEditorSeries.key)}
                onChange={(e) => updateSeriesSettingsOverride(styleEditorSeries.key, { chartType: e.target.value as ChartType })}
                className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                disabled={isSignalLightSeries(styleEditorSeries.key)}
              >
                <option value="line">Line</option>
                <option value="step">Step</option>
                <option value="area">Area</option>
                <option value="bar">Bar</option>
              </select>
            </label>

            {isDistributionMetricSeries(styleEditorSeries.key) && (
              <label className="mb-3 flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">Distribution Type</span>
                <select
                  value={getSeriesDistributionType(styleEditorSeries.key)}
                  onChange={(e) =>
                    updateSeriesSettingsOverride(styleEditorSeries.key, {
                      distributionType: e.target.value as "individual" | "cfd",
                    })
                  }
                  className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="individual">Individual</option>
                  <option value="cfd">CFD</option>
                </select>
              </label>
            )}

            {isCountingModeMetricSeries(styleEditorSeries.key) && (
              <label className="mb-3 flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">Counting Mode</span>
                <select
                  value={getSeriesCountingMode(styleEditorSeries.key)}
                  onChange={(e) =>
                    updateSeriesSettingsOverride(styleEditorSeries.key, {
                      countingMode: e.target.value as "summation" | "unique",
                    })
                  }
                  className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="summation">Occupancy</option>
                  <option value="unique">Unique</option>
                </select>
              </label>
            )}

            {isSignalLightSeries(styleEditorSeries.key) && (
              <>
                <label className="mb-3 flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700">
                  <span>Flat Line Stack Step</span>
                  <select
                    value={signalStatusStackStep}
                    onChange={(e) => setSignalStatusStackStep(Number(e.target.value))}
                    className="rounded border border-slate-300 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                  >
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                  </select>
                </label>

                <label className="mb-3 flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-700">Flat Line Y Value</span>
                  <input
                    type="number"
                    value={getSignalFlatLineY(styleEditorSeries.key)}
                    onChange={(e) =>
                      updateSeriesSettingsOverride(styleEditorSeries.key, {
                        flatLineY: Number(e.target.value),
                      })
                    }
                    className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>

                <label className="mb-2 flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700">
                  <span>Show highlight background</span>
                  <input
                    type="checkbox"
                    checked={getSeriesShowHighlight(styleEditorSeries.key)}
                    onChange={(e) =>
                      updateSeriesSettingsOverride(styleEditorSeries.key, {
                        showHighlight: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-slate-700"
                  />
                </label>

                <label className="mb-3 flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700">
                  <span>Show flat chart</span>
                  <input
                    type="checkbox"
                    checked={getSeriesShowLine(styleEditorSeries.key)}
                    onChange={(e) =>
                      updateSeriesSettingsOverride(styleEditorSeries.key, {
                        showLine: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-slate-700"
                  />
                </label>

                <label className="mb-3 flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700">
                  <span>Show chart</span>
                  <input
                    type="checkbox"
                    checked={getSeriesShowChart(styleEditorSeries.key)}
                    onChange={(e) =>
                      updateSeriesSettingsOverride(styleEditorSeries.key, {
                        showChart: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-slate-700"
                  />
                </label>

                {isSignalLightSeries(styleEditorSeries.key) && (
                  <label className="mb-3 flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700">
                    <span>Show Signal Cycling chart</span>
                    <input
                      type="checkbox"
                      checked={getSeriesShowCycling(styleEditorSeries.key)}
                      onChange={(e) =>
                        updateSeriesSettingsOverride(styleEditorSeries.key, {
                          showCycling: e.target.checked,
                        })
                      }
                      className="h-4 w-4 accent-slate-700"
                    />
                  </label>
                )}

                <label className="mb-2 flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700">
                  <span>Show min chart</span>
                  <input
                    type="checkbox"
                    checked={getSeriesShowMinChart(styleEditorSeries.key)}
                    onChange={(e) =>
                      updateSeriesSettingsOverride(styleEditorSeries.key, {
                        showMinChart: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-slate-700"
                  />
                </label>

                <label className="mb-3 flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700">
                  <span>Show max chart</span>
                  <input
                    type="checkbox"
                    checked={getSeriesShowMaxChart(styleEditorSeries.key)}
                    onChange={(e) =>
                      updateSeriesSettingsOverride(styleEditorSeries.key, {
                        showMaxChart: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-slate-700"
                  />
                </label>
              </>
            )}

            <label className="mb-3 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">Line Style</span>
              <select
                value={lineStyleOverrides[styleEditorSeries.key]?.dashPattern ?? styleEditorEffectiveStyle.dashPattern ?? ""}
                onChange={(e) => updateSeriesStyleOverride(styleEditorSeries.key, { dashPattern: e.target.value })}
                className="rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                disabled={getSeriesChartType(styleEditorSeries.key) === "bar" || isSignalLightSeries(styleEditorSeries.key)}
              >
                {LINE_STYLE_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">Line Width</span>
              <input
                type="range"
                min={0.5}
                max={8}
                step={0.1}
                value={lineStyleOverrides[styleEditorSeries.key]?.lineWidth ?? styleEditorEffectiveStyle.lineWidth}
                onChange={(e) => updateSeriesStyleOverride(styleEditorSeries.key, { lineWidth: Number(e.target.value) })}
                className="h-2 w-full cursor-pointer accent-slate-700"
                disabled={getSeriesChartType(styleEditorSeries.key) === "bar"}
              />
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {(lineStyleOverrides[styleEditorSeries.key]?.lineWidth ?? styleEditorEffectiveStyle.lineWidth).toFixed(1)}
              </div>
            </label>

            <label className="mb-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">Line Color</span>
              <input
                type="color"
                value={lineStyleOverrides[styleEditorSeries.key]?.color ?? styleEditorEffectiveStyle.color}
                onChange={(e) => updateSeriesStyleOverride(styleEditorSeries.key, { color: e.target.value })}
                className="h-10 w-full rounded-md border border-slate-300 bg-white dark:bg-slate-900 p-1"
                disabled={isSignalLightSeries(styleEditorSeries.key)}
              />
            </label>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => resetSeriesStyleOverride(styleEditorSeries.key)}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:bg-slate-950"
              >
                Reset Style
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDeleteSeries({ key: styleEditorSeries.key, label: styleEditorSeries.label })}
                  className="inline-flex items-center rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setStyleEditorSeriesKey(null)}
                  className="inline-flex items-center rounded-md border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-sm font-medium text-cyan-800 transition hover:bg-cyan-100"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteSeries && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Confirm Deletion</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Remove <span className="font-medium text-slate-800 dark:text-slate-200">{pendingDeleteSeries.label}</span> from the chart selection?
            </p>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteSeries(null)}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:bg-slate-950"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteSeriesFromChart(pendingDeleteSeries.key)}
                className="inline-flex items-center rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
