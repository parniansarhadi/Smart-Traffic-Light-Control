"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import ThemeToggle from "../_components/ThemeToggle";

interface SimulationStatus {
  isRunning: boolean;
  progress: number;
  logs: string[];
  lastUpdated: number;
}

interface BaseConfig {
  id: string;
  name: string;
  mode: string;
  ev_preemption: boolean;
  use_priority: boolean;
}

interface Candidate {
  name: string;
  type: "priority" | "adaptive" | "preemption" | "meta";
  [key: string]: any;
}

const Icons: Record<string, any> = {
  Play: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
  ),
  Stop: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>
  ),
  Save: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
  ),
  Settings: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
  ),
  Calendar: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
  ),
  Terminal: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
  ),
  Activity: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
  ),
  Shield: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
  ),
  Users: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><circle cx="19" cy="11" r="4" /></svg>
  ),
  Download: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
  ),
  Cloud: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19a3.5 3.5 0 1 1-5.83-2.65 4.82 4.82 0 1 1 8.28-4.48 3.5 3.5 0 0 1-2.45 7.13z" /><polyline points="12 13 12 17" /><polyline points="10 15 12 17 14 15" /></svg>
  ),
  Trash: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
  ),
  Check: ({ className }: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12" /></svg>
  ),
  Refresh: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
  ),
  Trophy: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2z" /></svg>
  )
};

const InputField = ({ label, value, onChange, type = "text", subtext = "", enabled = true, onToggle, layout = "vertical" }: any) => (
  <div className={`flex ${layout.includes("horizontal") ? "flex-row items-center gap-4" : "flex-col gap-1.5"} ${layout === "horizontal-reverse" ? "flex-row-reverse justify-end" : ""} transition-opacity duration-300 ${!enabled ? 'opacity-40' : ''}`}>
    {layout.includes("horizontal") && (
      <div className={`flex flex-col ${layout === "horizontal-reverse" ? "text-left min-w-[150px]" : "min-w-[200px]"}`}>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
        {subtext && <span className="text-[10px] text-slate-500 dark:text-slate-300 uppercase tracking-wider font-semibold">{subtext}</span>}
      </div>
    )}
    {layout === "vertical" && (
      <div className="flex justify-between items-center min-h-[1.5rem]">
        <div className="flex items-center gap-2">
          {onToggle && (
            <button
              onClick={() => onToggle(!enabled)}
              className={`w-8 h-4 flex-shrink-0 rounded-full transition-all relative ${enabled ? 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-all ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          )}
          <label className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 line-clamp-1 hover:line-clamp-none transition-all">{label}</label>
        </div>
        {subtext && <span className="text-[10px] text-slate-500 dark:text-slate-300 uppercase tracking-wider font-semibold flex-shrink-0 ml-2">{subtext}</span>}
      </div>
    )}
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(type === "number" ? (e.target.value === "" ? "" : parseFloat(e.target.value)) : e.target.value)}
      disabled={!enabled}
      className={`bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm ${!enabled ? 'cursor-not-allowed select-none' : ''} ${layout.includes("horizontal") ? "w-24" : "w-full"}`}
    />
  </div>
);

const CheckboxField = ({ label, value, onChange }: any) => (
  <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800/20 rounded-xl border border-slate-200 dark:border-slate-700/30">
    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
    <button
      onClick={() => onChange(!value)}
      className={`w-10 h-6 rounded-full transition-all relative ${value ? 'bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.3)]' : 'bg-slate-300 dark:bg-slate-700'}`}
    >
      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${value ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  </div>
);

const SelectField = ({ label, value, onChange, options, enabled = true, onToggle }: any) => (
  <div className={`flex flex-col gap-1.5 transition-opacity duration-300 ${!enabled ? 'opacity-40' : ''}`}>
    <div className="flex items-center gap-2 mb-0.5">
      {onToggle && (
        <button
          onClick={() => onToggle(!enabled)}
          className={`w-8 h-4 rounded-full transition-all relative ${enabled ? 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]' : 'bg-slate-300 dark:bg-slate-700'}`}
        >
          <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-all ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      )}
      <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
    </div>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!enabled}
      className={`bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-sky-500/50 outline-none text-sm ${!enabled ? 'cursor-not-allowed select-none' : ''}`}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

const SectionHeader = ({ title, subtitle, variant = "primary", enabled = true, onToggle }: any) => (
  <div className="mb-4 flex justify-between items-start">
    <div>
      <h3 className={`text-sm font-bold uppercase tracking-[0.15em] mb-1 ${variant === "primary" ? "text-sky-600 dark:text-sky-400" : "text-slate-500 dark:text-slate-300"}`}>
        {title}
      </h3>
      {subtitle && <p className="text-xs text-slate-700 dark:text-slate-400 font-medium">{subtitle}</p>}
    </div>
    {onToggle && (
      <button
        onClick={() => onToggle(!enabled)}
        className={`w-10 h-6 rounded-full transition-all relative ${enabled ? 'bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.3)]' : 'bg-slate-300 dark:bg-slate-700'}`}
      >
        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    )}
  </div>
);

const checkConfigPassesConstraints = (gKey: string, cData: any, baseCfg: any): boolean => {
  if (!cData || !baseCfg) return false;
  const veh = cData.vehicle || {};
  const ev = cData.emergency || {};
  const ped = cData.pedestrian || {};

  const baseVeh = baseCfg.vehicle || {};
  const baseEv = baseCfg.emergency || {};
  const basePed = baseCfg.pedestrian || {};

  const baseThru = baseVeh.throughput ?? baseVeh.Count ?? baseVeh['Total Vehicles'] ?? 240;
  const baseEvAvg = baseEv['Average Delay (s)'] ?? baseVeh.ev_avg ?? 15;
  const basePedAvg = basePed['Average Delay (s)'] ?? baseVeh.p_avg ?? 15;
  const baseCO2 = baseVeh['Avg CO2 (g)'] || 85;
  const baseCong = baseVeh['Avg Congestion Level'] ?? baseVeh.congestion_level ?? 0.18;
  const baseStops = baseVeh['Total Stops'] ?? baseVeh.total_vehicle_stops ?? 115;
  const baseAvgQueue = baseVeh['Average Queue Length'] ?? baseVeh.avg_queue ?? 0;
  const baseForceSwitches = baseVeh['preemption_force_switches'] ?? baseVeh['force_switches'] ?? 1;

  const curThru = veh.throughput ?? veh.Count ?? veh['Total Vehicles'] ?? 0;
  const evAvg = ev['Average Delay (s)'] ?? veh.ev_avg ?? 999;
  const pedAvg = ped['Average Delay (s)'] ?? veh.p_avg ?? 999;
  const co2 = veh['Avg CO2 (g)'] || 999;
  const congLevel = veh['Avg Congestion Level'] ?? veh.congestion_level ?? 999;
  const stops = veh['Total Stops'] ?? veh.total_vehicle_stops ?? 999;
  const avgQueue = veh['Average Queue Length'] ?? veh.avg_queue ?? 0;
  const forceSwitches = veh['preemption_force_switches'] ?? veh['force_switches'] ?? 0;
  const maxDelay = veh['Max Delay (s)'] ?? 0;
  const maxQueue = veh['MAX Queue Length'] ?? 0;
  const starv = veh['Starvation Events'] ?? 0;
  const queueTrend = veh['Queue Trend'] ?? veh.queue_trend ?? 1.0;

  const pedDelta = basePedAvg > 0 ? ((pedAvg - basePedAvg) / basePedAvg) * 100.0 : 0;
  const evImproved = baseEvAvg > 0 ? evAvg < baseEvAvg : true;
  const evAvgOk = baseEvAvg > 0 ? evAvg <= baseEvAvg : true;
  const pedOkGeneral = pedDelta <= 15.0;
  const starvOk = starv <= 2;
  const patienceOk = maxDelay <= 300;
  const spillbackOk = maxQueue <= 100;
  const trendOk = queueTrend <= 2.0;

  let co2Ok = true;
  if (gKey === "eco" && baseCO2 > 0) {
    co2Ok = co2 < baseCO2;
  } else {
    co2Ok = baseCO2 > 0 ? co2 <= baseCO2 * 1.15 : true;
  }

  let congestionOk = true;
  if (gKey === "low_congestion" && baseCong > 0) {
    congestionOk = congLevel < baseCong;
  } else {
    congestionOk = congLevel <= 0.8;
  }

  let pedOk = pedOkGeneral;
  if ((gKey === "ped_focus" || gKey === "ped_veh_focus") && basePedAvg > 0) {
    pedOk = pedAvg < basePedAvg;
  }

  let throughputOk = true;
  if (gKey === "throughput" && baseThru > 0) {
    throughputOk = curThru >= baseThru;
  } else {
    throughputOk = baseThru > 0 ? curThru >= baseThru * 0.95 : true;
  }

  const stopsOk = baseStops > 0 ? stops <= baseStops * 1.40 : true;
  const queueOk = baseAvgQueue > 0 ? avgQueue <= baseAvgQueue * 1.25 : true;
  const switchOk = baseForceSwitches > 0 ? forceSwitches <= baseForceSwitches * 2.0 : true;

  return evImproved && evAvgOk && pedOk && starvOk && co2Ok && stopsOk && queueOk && throughputOk && switchOk && patienceOk && spillbackOk && congestionOk && trendOk;
};

const getApexWinnerDetails = (gKey: string, configurations: Record<string, any>): { key: string, score: number, pass: boolean } => {
  if (gKey === "baseline") return { key: "fixed_no_preempt", score: 60.65, pass: true };
  const keys = Object.keys(configurations).filter(k => k !== "fixed_no_preempt" && k !== "fixed_with_preempt");
  if (keys.length === 0) return { key: "adaptive_weighted_with_preempt", score: 0, pass: true };

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

  return { key: bestKey, score: bestScore !== Infinity ? bestScore : 100, pass: true };
};

const getApexWinnerForGoal = (gKey: string, configurations: Record<string, any>): string => {
  return getApexWinnerDetails(gKey, configurations).key;
};

export default function SimulationDashboard() {

  const [networkConfig, setNetworkConfig] = useState<any>({});
  const [systemConfig, setSystemConfig] = useState<any>({});
  const [availableConfigs, setAvailableConfigs] = useState<{ baseConfigs: BaseConfig[], candidates: Record<string, Candidate[]> }>({ baseConfigs: [], candidates: {} });
  const [temporalParams, setTemporalParams] = useState({
    startDate: new Date().toISOString().split('T')[0],
    startTime: "08:00",
    endDate: new Date().toISOString().split('T')[0],
    endTime: "20:00"
  });
  const [customCommand, setCustomCommand] = useState("python3 sim_unit/core/main.py --mode real --real-traffic-source stream --benchmark-mode");
  const [simStatus, setSimStatus] = useState<SimulationStatus>({ isRunning: false, progress: 0, logs: [], lastUpdated: 0 });
  const [quickStats, setQuickStats] = useState({ lastSimulation: "Loading...", startTime: "N/A", endTime: "N/A" });
  const [activeTab, setActiveTab] = useState<"temporal" | "network" | "main_params" | "profiles" | "priority" | "preemption" | "pedestrians" | "environment" | "execution" | "optimizer" | "opt_winners" | "goal_benchmarks" | "cloud_atlas">("temporal");
  const [dbFetchStatus, setDbFetchStatus] = useState<{ loading: boolean, error: string | null, success: string | null }>({ loading: false, error: null, success: null });

  const [dbExportStatus, setDbExportStatus] = useState<{ loading: boolean, error: string | null, success: string | null }>({ loading: false, error: null, success: null });
  const [cloudResults, setCloudResults] = useState<any[]>([]);
  const [cloudFetchStatus, setCloudFetchStatus] = useState<{ loading: boolean, error: string | null }>({ loading: false, error: null });
  const [cloudLoadStatus, setCloudLoadStatus] = useState<Record<string, { loading: boolean, error: string | null, success: string | null }>>({});
  const [cloudDeleteStatus, setCloudDeleteStatus] = useState<Record<string, { loading: boolean, error: string | null }>>({});

  const [matrixData, setMatrixData] = useState<any>(null);
  const [matrixRefreshStatus, setMatrixRefreshStatus] = useState<{ loading: boolean, success: boolean }>({ loading: false, success: false });
  const [selectedMatrixGoal, setSelectedMatrixGoal] = useState<string>("baseline");
  const [matrixViewMode, setMatrixViewMode] = useState<"grid" | "table">("grid");
  const [isTier1Collapsed, setIsTier1Collapsed] = useState<boolean>(false);
  const [isTier2Collapsed, setIsTier2Collapsed] = useState<boolean>(false);
  const [isTier3Collapsed, setIsTier3Collapsed] = useState<boolean>(false);
  const [isTier4Collapsed, setIsTier4Collapsed] = useState<boolean>(false);
  const [radarSelectedGoals, setRadarSelectedGoals] = useState<string[]>(["baseline", "balanced"]);

  const toggleRadarGoal = (goalKey: string) => {
    if (radarSelectedGoals.includes(goalKey)) {
      if (radarSelectedGoals.length > 1) {
        setRadarSelectedGoals(radarSelectedGoals.filter(g => g !== goalKey));
      }
    } else {
      setRadarSelectedGoals([...radarSelectedGoals, goalKey]);
    }
  };

  const [optimizerOptions, setOptimizerOptions] = useState<any>({
    mode: "generic",
    realTrafficSource: "synthetic",
    goal: "balanced",
    includeStages: [], 
    phase1SimTime: 360,
    phase2SimTime: 720,
    maxPedWorsenPct: 15.0,
    maxStarvation: 2,
    maxQueueCap: 25,
    patienceCap: 120,
    metaStages: 1,
    safeGuard: true,
    refreshBaseline: false,
    strictStarvation: false,
    benchmarkMode: true,
    baselineName: "fixed no preempt",
    optimizeConfig: "adaptive_weighted_with_preempt",
    useMaxPedWorsenPct: false,
    useMaxStarvation: false,
    useMaxQueueCap: false,
    usePatienceCap: false,
    useMetaStages: false,
    metaHighSwitchMin: 2.5,
    metaHighSwitchMax: 4.5,
    metaHighBonusMin: 2.0,
    metaHighBonusMax: 4.0,
    metaHighStarvMin: 0.2,
    metaHighStarvMax: 0.5,
    metaLowSwitchMin: 0.4,
    metaLowSwitchMax: 0.8,
    metaLowBonusMin: 0.5,
    metaLowBonusMax: 0.9,
    metaLowStarvMin: 0.1,
    metaLowStarvMax: 0.3,
    useMetaScaling: false
  });
  const [optimizerCommand, setOptimizerCommand] = useState("");
  const [isManualOptimizer, setIsManualOptimizer] = useState(false);
  const [optConfigData, setOptConfigData] = useState<any>(null);
  const [optWinnersFilter, setOptWinnersFilter] = useState<string>("active");
  const [isRefreshingOpt, setIsRefreshingOpt] = useState<boolean>(false);
  const [stageSelectionMode, setStageSelectionMode] = useState<string>("auto");
  const [matrixSimTime, setMatrixSimTime] = useState<string>("720");
  const [executionOptions, setExecutionOptions] = useState<any>({
    mode: "real",
    realTrafficSource: "stream",
    simTime: 720,
    useGui: false,
    earlyStop: false,
    benchmarkMode: true,
    pedMode: "balanced",
    guiRotateDeg: 0.0,
    usePedMode: false,
    useSimTime: false,
    includeConfigs: ["fixed_no_preempt", "fixed_with_preempt", "adaptive_no_preempt", "adaptive_weighted", "adaptive_with_preempt", "adaptive_weighted_with_preempt"]
  });
  const [isManualExecution, setIsManualExecution] = useState(false);

  const consoleContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [netRes, sysRes, confRes, statsRes, optRes, matrixRes] = await Promise.all([
          fetch("/api/simulation-dashboard/network-layout"),
          fetch("/api/simulation-dashboard/system-param"),
          fetch("/api/simulation/configurations"),
          fetch("/api/simulation-dashboard/stats"),
          fetch("/api/simulation-dashboard/optimization-config"),
          fetch(`/api/simulation-dashboard/multi-goal-matrix?t=${Date.now()}`)
        ]);
        setNetworkConfig(await netRes.json());
        setSystemConfig(await sysRes.json());
        setAvailableConfigs(await confRes.json());
        setQuickStats(await statsRes.json());
        setOptConfigData(await optRes.json());
        setMatrixData(await matrixRes.json());
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (simStatus.isRunning) {
      interval = setInterval(async () => {
        try {
          const res = await fetch("/api/simulation/run");
          const status = await res.json();
          setSimStatus(status);
        } catch (err) { console.error(err); }
      }, 50);
    }
    return () => clearInterval(interval);
  }, [simStatus.isRunning]);

  useEffect(() => {
    if (consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [simStatus.logs]);

  useEffect(() => {
    if (!simStatus.isRunning) {
      fetch(`/api/simulation-dashboard/multi-goal-matrix?t=${Date.now()}`)
        .then(res => res.json())
        .then(data => setMatrixData(data))
        .catch(err => console.error(err));
    }
  }, [simStatus.isRunning]);

  const handleNetworkChange = (path: string, value: any) => {
    const newConfig = { ...networkConfig };
    const parts = path.split('.');
    let current = newConfig;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    setNetworkConfig(newConfig);
  };

  const handleSystemChange = (path: string, value: any) => {
    const newConfig = { ...systemConfig };
    const parts = path.split('.');
    let current = newConfig;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    setSystemConfig(newConfig);
  };

  const handleSaveAll = async () => {
    try {
      await Promise.all([
        fetch("/api/simulation-dashboard/network-layout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(networkConfig)
        }),
        fetch("/api/simulation-dashboard/system-param", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(systemConfig)
        })
      ]);
      alert("Configurations saved successfully!");
    } catch (err) { alert("Failed to save."); }
  };

  const handleResetDefaults = async () => {
    if (!confirm("Are you sure you want to reset all parameters to their original defaults? This will overwrite your current changes.")) return;
    try {
      const res = await fetch("/api/simulation-dashboard/reset-param", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setSystemConfig(data.config);
        alert("Parameters reset to defaults!");
      } else { throw new Error(data.error); }
    } catch (err) { alert("Failed to reset defaults."); }
  };

  const handleResetNetwork = async () => {
    if (!confirm("Are you sure you want to reset the network geometry to its original defaults?")) return;
    try {
      const res = await fetch("/api/simulation-dashboard/reset-network", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setNetworkConfig(data.config);
        alert("Network geometry reset to defaults!");
      } else { throw new Error(data.error); }
    } catch (err) { alert("Failed to reset network geometry."); }
  };

  const handleFetchData = async () => {
    setDbFetchStatus({ loading: true, error: null, success: null });
    try {
      const startIso = `${temporalParams.startDate}T${temporalParams.startTime}:00Z`;
      const endIso = `${temporalParams.endDate}T${temporalParams.endTime}:00Z`;

      const res = await fetch("http://127.0.0.1:8000/api/fetch-db-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_dt: startIso, end_dt: endIso })
      });
      const data = await res.json();
      if (data.status === "success") {
        setDbFetchStatus({ loading: false, error: null, success: `${data.message} Saved as ${data.filename}` });
      } else {
        setDbFetchStatus({ loading: false, error: data.message, success: null });
      }
    } catch (err) {
      setDbFetchStatus({ loading: false, error: "Failed to connect to simulation API (Port 8000).", success: null });
    }
  };

  const handleExportResults = async () => {
    setDbExportStatus({ loading: true, error: null, success: null });
    try {
      const res = await fetch("http://127.0.0.1:8000/api/export-latest-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (data.status === "success") {
        setDbExportStatus({ loading: false, error: null, success: data.message });
      } else {
        setDbExportStatus({ loading: false, error: data.message, success: null });
      }
    } catch (err) {
      setDbExportStatus({ loading: false, error: "Failed to connect to simulation API (Port 8000).", success: null });
    }
  };

  const handleFetchCloudResults = async () => {
    setCloudFetchStatus({ loading: true, error: null });
    try {
      const res = await fetch("http://127.0.0.1:8000/api/cloud-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (data.status === "success") {
        setCloudResults(data.data);
        setCloudFetchStatus({ loading: false, error: null });
      } else {
        setCloudFetchStatus({ loading: false, error: data.message });
      }
    } catch (err) {
      setCloudFetchStatus({ loading: false, error: "Failed to connect to simulation API (Port 8000)." });
    }
  };

  const handleLoadCloudRun = async (runId: string) => {
    setCloudLoadStatus(prev => ({ ...prev, [runId]: { loading: true, error: null, success: null } }));
    try {
      const res = await fetch("http://127.0.0.1:8000/api/download-cloud-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId })
      });
      const data = await res.json();
      if (data.status === "success") {
        setCloudLoadStatus(prev => ({ ...prev, [runId]: { loading: false, error: null, success: data.message } }));

      } else {
        setCloudLoadStatus(prev => ({ ...prev, [runId]: { loading: false, error: data.message, success: null } }));
      }
    } catch (err) {
      setCloudLoadStatus(prev => ({ ...prev, [runId]: { loading: false, error: "Connection error", success: null } }));
    }
  };

  const handleDeleteCloudRun = async (runId: string) => {
    if (!confirm(`Are you sure you want to delete run ${runId} from Cloud Atlas permanently?`)) return;

    setCloudDeleteStatus(prev => ({ ...prev, [runId]: { loading: true, error: null } }));
    try {
      const res = await fetch("http://127.0.0.1:8000/api/delete-cloud-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId })
      });
      const data = await res.json();
      if (data.status === "success") {
        setCloudDeleteStatus(prev => ({ ...prev, [runId]: { loading: false, error: null } }));

        setCloudResults(prev => prev.filter(r => r.run_id !== runId));
      } else {
        setCloudDeleteStatus(prev => ({ ...prev, [runId]: { loading: false, error: data.message } }));
      }
    } catch (err) {
      setCloudDeleteStatus(prev => ({ ...prev, [runId]: { loading: false, error: "Connection error" } }));
    }
  };

  const generateExecutionCommand = () => {
    let cmd = "python3 sim_unit/core/main.py";
    cmd += ` --mode ${executionOptions.mode}`;
    if (executionOptions.mode === "real") {
      cmd += ` --real-traffic-source ${executionOptions.realTrafficSource}`;
    }
    if (executionOptions.useSimTime && executionOptions.simTime !== "" && !isNaN(executionOptions.simTime)) {
      cmd += ` --sim-time ${executionOptions.simTime}`;
    }
    if (executionOptions.usePedMode && executionOptions.pedMode) {
      cmd += ` --ped-mode ${executionOptions.pedMode}`;
    }
    if (executionOptions.useGui) cmd += " --use-gui";
    if (executionOptions.earlyStop) cmd += " --early-stop";
    if (executionOptions.benchmarkMode) cmd += " --benchmark-mode";
    if (executionOptions.guiRotateDeg !== 0 && executionOptions.guiRotateDeg !== "" && !isNaN(executionOptions.guiRotateDeg)) {
      cmd += ` --gui-rotate-deg ${executionOptions.guiRotateDeg}`;
    }
    if (executionOptions.includeConfigs && executionOptions.includeConfigs.length > 0) {
      cmd += ` --include-configs ${executionOptions.includeConfigs.join(" ")}`;
    }
    return cmd;
  };

  useEffect(() => {
    if (!isManualExecution) {
      setCustomCommand(generateExecutionCommand());
    }
  }, [executionOptions, isManualExecution]);

  const handleStartSimulation = async () => {
    try {
      setSimStatus(prev => ({ ...prev, isRunning: true, progress: 0, logs: ["Starting..."] }));
      await fetch("/api/simulation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customCommand })
      });
    } catch (err) { setSimStatus(prev => ({ ...prev, isRunning: false })); }
  };

  const handleStopSimulation = async () => {
    try {
      await fetch("/api/simulation/run", {
        method: "DELETE"
      });
    } catch (err) { console.error("Failed to stop simulation:", err); }
  };

  const handleCleanupWorkspace = async () => {
    if (!confirm("Are you sure you want to delete ALL simulation outputs in sys_output? This cannot be undone.")) return;
    try {
      setSimStatus(prev => ({ ...prev, logs: [...prev.logs, "Cleaning sys_output directory..."] }));
      const res = await fetch("/api/simulation/cleanup", { method: "POST" });
      if (res.ok) {
        setSimStatus(prev => ({ ...prev, logs: [...prev.logs, "✅ Workspace cleaned successfully."] }));
      } else {
        setSimStatus(prev => ({ ...prev, logs: [...prev.logs, "❌ Failed to clean workspace."] }));
      }
    } catch (err) {
      setSimStatus(prev => ({ ...prev, logs: [...prev.logs, "❌ Error during cleanup."] }));
    }
  };

  const handleClearCache = async () => {
    if (!confirm("Are you sure you want to clear the optimizer cache? This will force the optimizer to re-simulate any configurations it previously cached.")) return;
    try {
      setSimStatus(prev => ({ ...prev, logs: [...prev.logs, "Clearing optimizer cache..."] }));
      const res = await fetch("/api/simulation/clear-cache", { method: "POST" });
      if (res.ok) {
        setSimStatus(prev => ({ ...prev, logs: [...prev.logs, "✅ Optimizer cache cleared."] }));
      } else {
        setSimStatus(prev => ({ ...prev, logs: [...prev.logs, "❌ Failed to clear cache."] }));
      }
    } catch (err) {
      setSimStatus(prev => ({ ...prev, logs: [...prev.logs, "❌ Error during cache cleanup."] }));
    }
  };

  const generateOptimizerCommand = () => {
    let script = optimizerOptions.goal === "all"
      ? "python3 sim_unit/optimization/run_Optimization.py"
      : "python3 sim_unit/optimization/rapid_grid_search.py";
    let cmd = script;
    cmd += ` --mode ${optimizerOptions.mode}`;
    if (optimizerOptions.mode === "real") {
      cmd += ` --real-traffic-source ${optimizerOptions.realTrafficSource}`;
    }
    cmd += ` --goal ${optimizerOptions.goal}`;
    if (optimizerOptions.phase1SimTime !== "" && !isNaN(optimizerOptions.phase1SimTime)) cmd += ` --phase1-sim-time ${optimizerOptions.phase1SimTime}`;
    if (optimizerOptions.phase2SimTime !== "" && !isNaN(optimizerOptions.phase2SimTime)) cmd += ` --phase2-sim-time ${optimizerOptions.phase2SimTime}`;
    if (optimizerOptions.useMaxPedWorsenPct && optimizerOptions.maxPedWorsenPct !== "" && !isNaN(optimizerOptions.maxPedWorsenPct)) cmd += ` --max-ped-worsen-pct ${optimizerOptions.maxPedWorsenPct}`;
    if (optimizerOptions.useMaxStarvation && optimizerOptions.maxStarvation !== "" && !isNaN(optimizerOptions.maxStarvation)) cmd += ` --max-starvation ${optimizerOptions.maxStarvation}`;
    if (optimizerOptions.useMaxQueueCap && optimizerOptions.maxQueueCap !== "" && !isNaN(optimizerOptions.maxQueueCap)) cmd += ` --max-queue-cap ${optimizerOptions.maxQueueCap}`;
    if (optimizerOptions.usePatienceCap && optimizerOptions.patienceCap !== "" && !isNaN(optimizerOptions.patienceCap)) cmd += ` --patience-cap ${optimizerOptions.patienceCap}`;
    if (optimizerOptions.useMetaStages && optimizerOptions.metaStages !== "" && !isNaN(optimizerOptions.metaStages)) cmd += ` --meta-stages ${optimizerOptions.metaStages}`;
    cmd += ` --baseline-name "${optimizerOptions.baselineName}"`;
    if (optimizerOptions.optimizeConfig) {
      cmd += ` --optimize-config ${optimizerOptions.optimizeConfig}`;
    }

    if (optimizerOptions.safeGuard) cmd += " --safe-guard";
    if (optimizerOptions.refreshBaseline) cmd += " --refresh-baseline";
    if (optimizerOptions.strictStarvation) cmd += " --strict-starvation";
    if (optimizerOptions.benchmarkMode) cmd += " --benchmark-mode";

    if (stageSelectionMode === "manual" && optimizerOptions.includeStages && optimizerOptions.includeStages.length > 0) {
      cmd += ` --include-stages ${optimizerOptions.includeStages.join(" ")}`;
    }

    if (optimizerOptions.useMetaScaling) {
      if (optimizerOptions.metaHighSwitchMin !== "" && optimizerOptions.metaHighSwitchMax !== "")
        cmd += ` --meta-high-switch-mults ${optimizerOptions.metaHighSwitchMin} ${optimizerOptions.metaHighSwitchMax}`;
      if (optimizerOptions.metaHighBonusMin !== "" && optimizerOptions.metaHighBonusMax !== "")
        cmd += ` --meta-high-bonus-mults ${optimizerOptions.metaHighBonusMin} ${optimizerOptions.metaHighBonusMax}`;
      if (optimizerOptions.metaHighStarvMin !== "" && optimizerOptions.metaHighStarvMax !== "")
        cmd += ` --meta-high-starv_mults ${optimizerOptions.metaHighStarvMin} ${optimizerOptions.metaHighStarvMax}`;
      if (optimizerOptions.metaLowSwitchMin !== "" && optimizerOptions.metaLowSwitchMax !== "")
        cmd += ` --meta-low-switch-mults ${optimizerOptions.metaLowSwitchMin} ${optimizerOptions.metaLowSwitchMax}`;
      if (optimizerOptions.metaLowBonusMin !== "" && optimizerOptions.metaLowBonusMax !== "")
        cmd += ` --meta-low-bonus-mults ${optimizerOptions.metaLowBonusMin} ${optimizerOptions.metaLowBonusMax}`;
      if (optimizerOptions.metaLowStarvMin !== "" && optimizerOptions.metaLowStarvMax !== "")
        cmd += ` --meta-low-starv_mults ${optimizerOptions.metaLowStarvMin} ${optimizerOptions.metaLowStarvMax}`;
    }

    return cmd;
  };

  useEffect(() => {
    if (!isManualOptimizer) {
      setOptimizerCommand(generateOptimizerCommand());
    }
  }, [optimizerOptions, isManualOptimizer, stageSelectionMode]);

  const handleStartOptimizer = async () => {
    try {
      setSimStatus(prev => ({ ...prev, isRunning: true, progress: 0, logs: ["Launching Optimizer Hub..."] }));
      await fetch("/api/simulation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customCommand: optimizerCommand })
      });
    } catch (err) { setSimStatus(prev => ({ ...prev, isRunning: false })); }
  };

  const getOptimizerStatusLabel = () => {
    if (!simStatus.isRunning) return "Ready to Search";

    let currentSweepGoal = "";
    for (let i = simStatus.logs.length - 1; i >= 0; i--) {
      const log = simStatus.logs[i];
      const goalMatch = log.match(/RUNNING OPTIMIZATION FOR GOAL:\s*(\w+)/i);
      if (goalMatch) {
        currentSweepGoal = goalMatch[1].toUpperCase();
        break;
      }
    }
    for (let i = simStatus.logs.length - 1; i >= 0; i--) {
      const log = simStatus.logs[i];
      if (log.includes("Running final simulation") || log.includes("Final Run")) {
        return currentSweepGoal ? `Sweep (${currentSweepGoal}): Final Run ...` : "Optimizing (Final Run) ...";
      }
      if (log.includes("Phase 2")) {
        return currentSweepGoal ? `Sweep (${currentSweepGoal}): Phase 2 ...` : "Optimizing (Phase 2) ...";
      }
      if (log.includes("Phase 1")) {
        return currentSweepGoal ? `Sweep (${currentSweepGoal}): Phase 1 ...` : "Optimizing (Phase 1) ...";
      }
      if (log.includes("Forcing a baseline run") || log.includes("Output folder is empty") || log.includes("Initial Run")) {
        return currentSweepGoal ? `Sweep (${currentSweepGoal}): Initial Run ...` : "Optimizing (Initial Run) ...";
      }
    }
    return currentSweepGoal ? `Sweep (${currentSweepGoal}) ...` : "Optimizing (Initial Run) ...";
  };

  const handleStartMatrix = async () => {
    try {
      setSimStatus(prev => ({ ...prev, isRunning: true, progress: 0, logs: ["Launching 48-Mode Multi-Goal Simulation Matrix..."] }));
      let cmd = "python3 sim_unit/optimization/run_multi_goal_matrix.py";
      if (matrixSimTime !== "") {
        cmd += ` --sim-time ${matrixSimTime}`;
      }
      await fetch("/api/simulation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customCommand: cmd })
      });
    } catch (err) { setSimStatus(prev => ({ ...prev, isRunning: false })); }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-200 font-sans selection:bg-sky-500/30 pb-24">

      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-pink-900/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-sky-900/10 blur-[100px] rounded-full" />
        <div className="absolute bottom-[10%] left-[20%] w-[30%] h-[30%] bg-purple-900/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-12 z-10">

        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-lg mb-12 xl:flex-row xl:items-center xl:justify-between backdrop-blur-xl">
          <div className="flex items-center gap-4 min-w-0">
            <div className="p-3 bg-gradient-to-br from-pink-500 via-purple-500 to-sky-600 rounded-2xl shadow-lg shadow-purple-500/30 text-white text-2xl font-bold flex items-center justify-center w-14 h-14 flex-shrink-0">
              🎛️
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight truncate">Control Hub</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 font-medium truncate">Fine-tune adaptive signaling and orchestrate simulations.</p>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-2.5 items-center flex-shrink-0 overflow-x-auto py-1 max-w-full">
            <ThemeToggle />
            <Link href="/project_overview" className="inline-flex items-center rounded-xl border border-pink-300 dark:border-pink-800 bg-pink-50 dark:bg-pink-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-pink-800 dark:text-pink-300 transition hover:bg-pink-100 dark:hover:bg-pink-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              🚀 Project Overview
            </Link>
            <Link href="/simulation_data" className="inline-flex items-center rounded-xl border border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-cyan-800 dark:text-cyan-300 transition hover:bg-cyan-100 dark:hover:bg-cyan-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              📊 Simulation Data
            </Link>
            <Link href="/traffic_charts" className="inline-flex items-center rounded-xl border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-indigo-800 dark:text-indigo-300 transition hover:bg-indigo-100 dark:hover:bg-indigo-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              📈 Traffic Charts
            </Link>
            <Link href="/system_help" className="inline-flex items-center rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-purple-800 dark:text-purple-300 transition hover:bg-purple-100 dark:hover:bg-purple-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              📚 System Help
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          <aside className="lg:col-span-3 space-y-2">
            {[
              { id: "temporal", label: "Simulation Window", icon: <Icons.Calendar /> },
              { id: "network", label: "Network Architecture", icon: <Icons.Settings /> },
              { id: "main_params", label: "Core System", icon: <Icons.Settings /> },
              { id: "profiles", label: "Traffic Profiles", icon: <Icons.Activity /> },
              { id: "priority", label: "Priority & Fairness", icon: <Icons.Activity /> },
              { id: "preemption", label: "EV Preemption", icon: <Icons.Shield /> },
              { id: "pedestrians", label: "Pedestrian Control", icon: <Icons.Users /> },
              { id: "environment", label: "Environmental Policy", icon: <Icons.Cloud /> },
              { id: "execution", label: "Execution Hub", icon: <Icons.Terminal /> },
              { id: "optimizer", label: "Optimizer Hub", icon: <Icons.Activity /> },
              { id: "opt_winners", label: "Optimization Winners", icon: <Icons.Trophy /> },
              { id: "goal_benchmarks", label: "Goal Benchmarks", icon: <Icons.Trophy /> },
              { id: "cloud_atlas", label: "Cloud Atlas", icon: <Icons.Cloud /> }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all border ${activeTab === tab.id
                  ? "bg-sky-500/10 border-sky-500/30 text-sky-400 shadow-glow shadow-sky-500/5"
                  : "bg-transparent border-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-800/30 hover:text-slate-300"
                  }`}
              >
                {tab.icon}
                <span className="font-medium text-sm">{tab.label}</span>
              </button>
            ))}

            <div className="mt-8 pt-8 border-t border-slate-800/50 px-4">
              <SectionHeader title="Quick Stats" />
              <div className="space-y-2 text-xs text-slate-700 dark:text-slate-200 dark:text-slate-200">
                <div className="flex justify-between"><span>Last Run:</span><span className="text-slate-700 dark:text-slate-200">{quickStats.lastSimulation}</span></div>
                <div className="flex justify-between"><span>Start:</span><span className="text-slate-700 dark:text-slate-200">{quickStats.startTime}</span></div>
                <div className="flex justify-between"><span>End:</span><span className="text-slate-700 dark:text-slate-200">{quickStats.endTime}</span></div>
              </div>
            </div>
          </aside>

          <main className="lg:col-span-9">
            <div className="bg-neutral-100 dark:bg-slate-900/30 backdrop-blur-xl border border-slate-200 dark:border-slate-800/50 rounded-3xl p-8 pt-20 shadow-2xl min-h-[700px] max-h-[850px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 relative">

              {activeTab !== "cloud_atlas" && (
                <div className="absolute top-8 right-8 z-20 flex items-center gap-2">
                  {(activeTab === "execution" || activeTab === "optimizer") && (
                    <>
                      <button
                        onClick={handleClearCache}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-xl transition-all active:scale-95 text-xs font-bold border border-amber-500/30 mr-2"
                      >
                        <Icons.Activity />
                        <span>Clear Cache</span>
                      </button>
                      <button
                        onClick={handleCleanupWorkspace}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-xl transition-all active:scale-95 text-xs font-bold border border-rose-500/30 mr-2"
                      >
                        <Icons.Trash />
                        <span>Clean Workspace</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={activeTab === "temporal" || activeTab === "network" ? handleResetNetwork : handleResetDefaults}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl transition-all active:scale-95 text-xs font-bold border border-slate-700/50"
                  >
                    <Icons.Settings />
                    <span>{activeTab === "temporal" || activeTab === "network" ? "Reset Geometry" : "Reset Defaults"}</span>
                  </button>
                  <button
                    onClick={handleSaveAll}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl transition-all active:scale-95 text-xs font-bold shadow-lg shadow-emerald-500/20"
                  >
                    <Icons.Save />
                    <span>Save Changes</span>
                  </button>
                </div>
              )}

              {activeTab === "temporal" && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section>
                    <SectionHeader title="Temporal Window" subtitle="Simulation duration and data ingestion boundaries" />
                    <div className="grid grid-cols-2 gap-6 p-6 bg-slate-800/20 rounded-2xl border border-slate-700/30">
                      <InputField label="Start Date" type="date" value={temporalParams.startDate} onChange={(v: string) => setTemporalParams(p => ({ ...p, startDate: v }))} />
                      <InputField label="Start Time" type="time" value={temporalParams.startTime} onChange={(v: string) => setTemporalParams(p => ({ ...p, startTime: v }))} />
                      <InputField label="End Date" type="date" value={temporalParams.endDate} onChange={(v: string) => setTemporalParams(p => ({ ...p, endDate: v }))} />
                      <InputField label="End Time" type="time" value={temporalParams.endTime} onChange={(v: string) => setTemporalParams(p => ({ ...p, endTime: v }))} />

                      <div className="col-span-2 pt-4 border-t border-slate-700/30 flex flex-col gap-4">
                        <button
                          onClick={handleFetchData}
                          disabled={dbFetchStatus.loading}
                          className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg ${dbFetchStatus.loading
                            ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                            : "bg-sky-600 hover:bg-sky-500 text-white shadow-sky-500/20"
                            }`}
                        >
                          {dbFetchStatus.loading ? (
                            <div className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                          ) : <Icons.Download />}
                          <span>{dbFetchStatus.loading ? "Fetching from Atlas..." : "Fetch from Cloud Atlas"}</span>
                        </button>

                        {dbFetchStatus.error && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                            ⚠️ {dbFetchStatus.error}
                          </div>
                        )}
                        {dbFetchStatus.success && (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                            ✅ {dbFetchStatus.success}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "network" && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section>
                    <SectionHeader title="Network Architecture" subtitle="Lanes, Signal Heads, and Physical Geometry" />
                    <div className="space-y-6">
                      <div className="p-6 bg-purple-200/50 dark:bg-purple-900/30 rounded-2xl border border-purple-400/60 dark:border-purple-800/40 grid grid-cols-2 gap-6">
                        <div className="col-span-2 p-6 bg-purple-200/50 dark:bg-purple-900/30 rounded-2xl border border-purple-300/50 dark:border-purple-800/40">
                          <label className="text-sm font-bold text-sky-600 dark:text-sky-500 uppercase tracking-widest mb-2 block">Center Area Logic</label>
                          <select
                            value={networkConfig.intersection_network?.center_area === null ? "null" : networkConfig.intersection_network?.center_area.toString()}
                            onChange={(e) => handleNetworkChange("intersection_network.center_area", e.target.value === "null" ? null : e.target.value === "true")}
                            className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-200"
                          >
                            <option value="null">Auto Detect</option>
                            <option value="true">Force Intersection Collision Logic</option>
                            <option value="false">Disable Collision Logic</option>
                          </select>
                        </div>
                        {networkConfig.structure_data?.lanes?.map((lane: any, idx: number) => (
                          <React.Fragment key={idx}>
                            <InputField label={`${lane.direction_id.replace('_', ' ')} Lanes`} type="number" value={lane.lanes_count} onChange={(v: any) => handleNetworkChange(`structure_data.lanes.${idx}.lanes_count`, v)} />
                            <InputField label={`Obs. Length (m)`} type="number" value={lane.observable_length} onChange={(v: any) => handleNetworkChange(`structure_data.lanes.${idx}.observable_length`, v)} />
                          </React.Fragment>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 space-y-4">
                          <SectionHeader title="Traffic Lights" variant="secondary" />
                          <div className="grid grid-cols-1 gap-4">
                            {networkConfig.structure_data?.traffic_lights?.map((tl: any, idx: number) => (
                              <InputField key={idx} label={tl.direction_id.replace('_', ' ')} type="number" value={tl.stoplight_count} onChange={(v: any) => handleNetworkChange(`structure_data.traffic_lights.${idx}.stoplight_count`, v)} />
                            ))}
                          </div>
                        </div>
                        <div className="p-6 bg-amber-500/10 rounded-2xl border border-amber-500/20 space-y-4">
                          <SectionHeader title="Pedestrian Lights" variant="secondary" />
                          <div className="grid grid-cols-1 gap-4">
                            {networkConfig.structure_data?.pedestrian_lights?.map((pl: any, idx: number) => (
                              <InputField key={idx} label={pl.direction_id.replace('_', ' ')} type="number" value={pl.stoplight_count} onChange={(v: any) => handleNetworkChange(`structure_data.pedestrian_lights.${idx}.stoplight_count`, v)} />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="p-6 bg-blue-200/40 dark:bg-blue-900/30 rounded-2xl border border-blue-300/40 dark:border-blue-800/40">
                        <SectionHeader title="Sidewalk Widths (m)" variant="secondary" />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {networkConfig.structure_data?.pedestrians?.map((ped: any, idx: number) => (
                            <InputField key={idx} label={ped.crosswalk_placement.replace('_', ' ')} type="number" value={ped.sidewalkWidth} onChange={(v: any) => handleNetworkChange(`structure_data.pedestrians.${idx}.sidewalkWidth`, v)} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "main_params" && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section className="space-y-4">
                    <SectionHeader title="[PRIMARY] Adaptive Timing" subtitle="Core guardrails for the light cycle" variant="primary" />
                    <div className="grid grid-cols-2 gap-4 p-6 bg-blue-500/5 rounded-2xl border border-blue-500/20">
                      <InputField label="Min Green Time (s)" type="number" value={systemConfig.adaptive_control?.min_green_time} onChange={(v: any) => handleSystemChange("adaptive_control.min_green_time", v)} />
                      <InputField label="Max Green Time (s)" type="number" value={systemConfig.adaptive_control?.max_green_time} onChange={(v: any) => handleSystemChange("adaptive_control.max_green_time", v)} />
                      <InputField label="Safety Min Green (s)" type="number" value={systemConfig.adaptive_control?.safety_min_green_floor} onChange={(v: any) => handleSystemChange("adaptive_control.safety_min_green_floor", v)} subtext="Hard Safety Floor" />
                      <InputField label="Hard Max Green (s)" type="number" value={systemConfig.adaptive_control?.hard_max_green_ceiling} onChange={(v: any) => handleSystemChange("adaptive_control.hard_max_green_ceiling", v)} subtext="Absolute Ceiling" />
                      <div className="col-span-2 p-5 bg-red-500/5 rounded-2xl border border-red-500/20 grid grid-cols-2 gap-8 items-center">
                        <CheckboxField
                          label="Enable Preemption Bypass"
                          value={systemConfig.adaptive_control?.enable_preemption_bypass}
                          onChange={(v: boolean) => handleSystemChange("adaptive_control.enable_preemption_bypass", v)}
                        />
                        <InputField
                          label="EV Min Green (s)"
                          type="number"
                          value={systemConfig.adaptive_control?.preemption_min_green}
                          onChange={(v: any) => handleSystemChange("adaptive_control.preemption_min_green", v)}
                          subtext="Min wait for sirens"
                          layout="horizontal"
                        />
                      </div>
                      <InputField label="Base Green Duration (s)" type="number" value={systemConfig.initial_tls_program?.green_duration} onChange={(v: any) => handleSystemChange("initial_tls_program.green_duration", v)} />
                      <InputField label="Fixed Red Time (s)" type="number" value={systemConfig.initial_tls_program?.green_no_ped_duration} onChange={(v: any) => handleSystemChange("initial_tls_program.green_no_ped_duration", v)} />
                      <InputField label="Yellow Duration (s)" type="number" value={systemConfig.initial_tls_program?.yellow_duration} onChange={(v: any) => handleSystemChange("initial_tls_program.yellow_duration", v)} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <SectionHeader title="[PRIMARY] Starvation & Safety" subtitle="Sensitivity to waiting vehicles" variant="primary" />
                    <div className="grid grid-cols-2 gap-4 p-6 bg-blue-500/5 rounded-2xl border border-blue-500/20">
                      <InputField label="Max Starvation Penalty" type="number" value={systemConfig.adaptive_control?.no_preempt_policy?.max_starvation_penalty} onChange={(v: any) => handleSystemChange("adaptive_control.no_preempt_policy.max_starvation_penalty", v)} />
                      <InputField label="Max Red Limit (s)" type="number" value={systemConfig.adaptive_control?.dynamic_max_red?.max_red_limit} onChange={(v: any) => handleSystemChange("adaptive_control.dynamic_max_red.max_red_limit", v)} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <SectionHeader title="[SECONDARY] Decision Sigmoid" subtitle="Mathematical tuning of the switch threshold" variant="secondary" />
                    <div className="grid grid-cols-4 gap-4 p-6 bg-slate-800/10 rounded-2xl border border-slate-700/30">
                      <InputField label="Base Switch Cost" type="number" value={systemConfig.adaptive_control?.no_preempt_policy?.base_switch_cost} onChange={(v: any) => handleSystemChange("adaptive_control.no_preempt_policy.base_switch_cost", v)} />
                      <InputField label="Green Active Bonus" type="number" value={systemConfig.adaptive_control?.no_preempt_policy?.green_active_bonus} onChange={(v: any) => handleSystemChange("adaptive_control.no_preempt_policy.green_active_bonus", v)} />
                      <InputField label="Queue Tolerance" type="number" value={systemConfig.adaptive_control?.no_preempt_policy?.queue_tolerance} onChange={(v: any) => handleSystemChange("adaptive_control.no_preempt_policy.queue_tolerance", v)} />
                      <InputField label="Threshold Cap" type="number" value={systemConfig.adaptive_control?.no_preempt_policy?.max_threshold_cap} onChange={(v: any) => handleSystemChange("adaptive_control.no_preempt_policy.max_threshold_cap", v)} />
                      <InputField label="Sigmoid Steepness" type="number" value={systemConfig.adaptive_control?.no_preempt_policy?.sigmoid_steepness} onChange={(v: any) => handleSystemChange("adaptive_control.no_preempt_policy.sigmoid_steepness", v)} />
                      <InputField label="Zero-Waste Mult." type="number" value={systemConfig.adaptive_control?.no_preempt_policy?.zero_waste_multiplier} onChange={(v: any) => handleSystemChange("adaptive_control.no_preempt_policy.zero_waste_multiplier", v)} />
                      <InputField label="Pressure Scaling" type="number" value={systemConfig.adaptive_control?.no_preempt_policy?.weight_to_queue_factor} onChange={(v: any) => handleSystemChange("adaptive_control.no_preempt_policy.weight_to_queue_factor", v)} subtext="Weight -> Q units" />
                      <InputField label="Priority Unit Cost" type="number" value={systemConfig.adaptive_control?.no_preempt_policy?.priority_unit_cost} onChange={(v: any) => handleSystemChange("adaptive_control.no_preempt_policy.priority_unit_cost", v)} />
                      <InputField label="Clearance Buffer" type="number" value={systemConfig.adaptive_control?.predictive_logic?.clearance_buffer} onChange={(v: any) => handleSystemChange("adaptive_control.predictive_logic.clearance_buffer", v)} />
                      <InputField label="Post-Perfect Mult" type="number" value={systemConfig.adaptive_control?.predictive_logic?.post_perfect_threshold_mult} onChange={(v: any) => handleSystemChange("adaptive_control.predictive_logic.post_perfect_threshold_mult", v)} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <SectionHeader title="[SECONDARY] Dynamic Red Limits" subtitle="Congestion-based timing caps" variant="secondary" />
                    <div className="grid grid-cols-2 gap-4 p-6 bg-slate-800/10 rounded-2xl border border-slate-700/30">
                      <InputField label="Base Red (s)" type="number" value={systemConfig.adaptive_control?.dynamic_max_red?.base_red} onChange={(v: any) => handleSystemChange("adaptive_control.dynamic_max_red.base_red", v)} />
                      <InputField label="Congestion Limit" type="number" value={systemConfig.adaptive_control?.dynamic_max_red?.max_congestion_vehicles} onChange={(v: any) => handleSystemChange("adaptive_control.dynamic_max_red.max_congestion_vehicles", v)} />
                      <InputField label="Red Compens. (s)" type="number" value={systemConfig.adaptive_control?.dynamic_max_red?.compensation_duration} onChange={(v: any) => handleSystemChange("adaptive_control.dynamic_max_red.compensation_duration", v)} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <SectionHeader title="[THIRD] Stretch Logic & Incidents" subtitle="Edge-case timing adjustments" variant="tertiary" />
                    <div className="grid grid-cols-4 gap-4 p-6 bg-slate-800/5 rounded-2xl border border-slate-800/20">
                      <InputField label="Startup Stretch" type="number" value={systemConfig.adaptive_control?.stretch_logic?.startup_stretch} onChange={(v: any) => handleSystemChange("adaptive_control.stretch_logic.startup_stretch", v)} />
                      <InputField label="Startup QDR" type="number" value={systemConfig.adaptive_control?.stretch_logic?.startup_qdr_threshold} onChange={(v: any) => handleSystemChange("adaptive_control.stretch_logic.startup_qdr_threshold", v)} />
                      <InputField label="Weather Stretch" type="number" value={systemConfig.adaptive_control?.stretch_logic?.weather_stretch} onChange={(v: any) => handleSystemChange("adaptive_control.stretch_logic.weather_stretch", v)} />
                      <InputField label="Weather QDR" type="number" value={systemConfig.adaptive_control?.stretch_logic?.weather_qdr_threshold} onChange={(v: any) => handleSystemChange("adaptive_control.stretch_logic.weather_qdr_threshold", v)} />
                    </div>
                    <div className="grid grid-cols-3 gap-4 p-4 bg-slate-800/5 rounded-xl border border-slate-800/10 mt-2">
                      <InputField label="Incident Min Time" type="number" value={systemConfig.adaptive_control?.stretch_logic?.incident_detection?.min_time} onChange={(v: any) => handleSystemChange("adaptive_control.stretch_logic.incident_detection.min_time", v)} />
                      <InputField label="Recent QDR Thr" type="number" value={systemConfig.adaptive_control?.stretch_logic?.incident_detection?.recent_qdr_threshold} onChange={(v: any) => handleSystemChange("adaptive_control.stretch_logic.incident_detection.recent_qdr_threshold", v)} />
                      <InputField label="Avg QDR Min" type="number" value={systemConfig.adaptive_control?.stretch_logic?.incident_detection?.avg_qdr_min} onChange={(v: any) => handleSystemChange("adaptive_control.stretch_logic.incident_detection.avg_qdr_min", v)} />
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "profiles" && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section>
                    <SectionHeader title="Dynamic Profile Control" subtitle="Master toggle for volume-based behavioral shifts" />
                    <div className="flex flex-row items-center justify-between gap-12 p-8 bg-slate-800/20 rounded-2xl border border-slate-700/30">
                      <div className="flex-1 max-w-sm">
                        <CheckboxField
                          label="Enable Dynamic Traffic Profiles"
                          value={systemConfig.adaptive_control?.use_volume_profiles}
                          onChange={(v: boolean) => handleSystemChange("adaptive_control.use_volume_profiles", v)}
                        />
                      </div>
                      <div className="flex-1">
                        <InputField
                          label="Switch Stabilization Time (s)"
                          type="number"
                          value={systemConfig.adaptive_control?.volume_profiles?.switch_stabilization_s}
                          onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.switch_stabilization_s", v)}
                          layout="horizontal"
                          subtext="Hysteresis window"
                        />
                      </div>
                    </div>
                  </section>
                  <section>
                    <SectionHeader title="High Traffic Profile" subtitle="Relative multipliers used when intersection volume exceeds threshold" />
                    <div className="grid grid-cols-2 gap-6 p-6 bg-slate-800/20 rounded-2xl border border-slate-700/30">
                      <InputField label="Activation Threshold" type="number" value={systemConfig.adaptive_control?.volume_profiles?.high_traffic?.threshold} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.high_traffic.threshold", v)} />
                      <InputField label="Base Switch Cost (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.high_traffic?.base_switch_cost_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.high_traffic.base_switch_cost_mult", v)} />
                      <InputField label="Green Active Bonus (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.high_traffic?.green_active_bonus_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.high_traffic.green_active_bonus_mult", v)} />
                      <InputField label="Starvation Penalty (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.high_traffic?.max_starvation_penalty_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.high_traffic.max_starvation_penalty_mult", v)} />
                      <InputField label="Queue Tolerance (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.high_traffic?.queue_tolerance_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.high_traffic.queue_tolerance_mult", v)} />
                      <InputField label="Pressure Scaling (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.high_traffic?.weight_to_queue_factor_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.high_traffic.weight_to_queue_factor_mult", v)} subtext="Wait -> Q conversion" />
                      <InputField label="Zero-Waste (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.high_traffic?.zero_waste_multiplier_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.high_traffic.zero_waste_multiplier_mult", v)} subtext="Gap sensitivity" />
                      <InputField label="Min Green (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.high_traffic?.min_green_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.high_traffic.min_green_mult", v)} />
                      <InputField label="Max Green (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.high_traffic?.max_green_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.high_traffic.max_green_mult", v)} />
                    </div>
                  </section>
                  <section>
                    <SectionHeader title="Low Traffic Profile" subtitle="Relative multipliers used when intersection is nearly empty" variant="secondary" />
                    <div className="grid grid-cols-2 gap-6 p-6 bg-slate-800/10 rounded-2xl border border-slate-700/30">
                      <InputField label="Activation Threshold" type="number" value={systemConfig.adaptive_control?.volume_profiles?.low_traffic?.threshold} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.low_traffic.threshold", v)} />
                      <InputField label="Base Switch Cost (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.low_traffic?.base_switch_cost_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.low_traffic.base_switch_cost_mult", v)} />
                      <InputField label="Green Active Bonus (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.low_traffic?.green_active_bonus_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.low_traffic.green_active_bonus_mult", v)} />
                      <InputField label="Starvation Penalty (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.low_traffic?.max_starvation_penalty_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.low_traffic.max_starvation_penalty_mult", v)} />
                      <InputField label="Queue Tolerance (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.low_traffic?.queue_tolerance_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.low_traffic.queue_tolerance_mult", v)} />
                      <InputField label="Pressure Scaling (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.low_traffic?.weight_to_queue_factor_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.low_traffic.weight_to_queue_factor_mult", v)} subtext="Wait -> Q conversion" />
                      <InputField label="Zero-Waste (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.low_traffic?.zero_waste_multiplier_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.low_traffic.zero_waste_multiplier_mult", v)} subtext="Gap sensitivity" />
                      <InputField label="Min Green (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.low_traffic?.min_green_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.low_traffic.min_green_mult", v)} />
                      <InputField label="Max Green (Mult)" type="number" value={systemConfig.adaptive_control?.volume_profiles?.low_traffic?.max_green_mult} onChange={(v: any) => handleSystemChange("adaptive_control.volume_profiles.low_traffic.max_green_mult", v)} />
                    </div>
                  </section>

                  <section>
                    <SectionHeader title="Rush Hour Orchestration" subtitle="Real-time and step-based peak period biasing" variant="tertiary" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 bg-slate-800/20 rounded-2xl border border-slate-700/30">

                      <div className="space-y-4 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                        <p className="text-xs font-bold text-sky-400 uppercase tracking-widest">Morning Peak</p>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Start Hour (0-23)" type="number" value={systemConfig.adaptive_control?.rush_hour_config?.morning_rush_start_hour} onChange={(v: any) => handleSystemChange("adaptive_control.rush_hour_config.morning_rush_start_hour", v)} />
                          <InputField label="End Hour (0-23)" type="number" value={systemConfig.adaptive_control?.rush_hour_config?.morning_rush_end_hour} onChange={(v: any) => handleSystemChange("adaptive_control.rush_hour_config.morning_rush_end_hour", v)} />

                        </div>
                      </div>

                      <div className="space-y-4 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                        <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Evening Peak</p>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Start Hour (0-23)" type="number" value={systemConfig.adaptive_control?.rush_hour_config?.evening_rush_start_hour} onChange={(v: any) => handleSystemChange("adaptive_control.rush_hour_config.evening_rush_start_hour", v)} />
                          <InputField label="End Hour (0-23)" type="number" value={systemConfig.adaptive_control?.rush_hour_config?.evening_rush_end_hour} onChange={(v: any) => handleSystemChange("adaptive_control.rush_hour_config.evening_rush_end_hour", v)} />

                        </div>
                      </div>

                      <div className="col-span-1 md:col-span-2 p-6 bg-slate-800/30 rounded-xl border border-slate-700/30 mt-4">
                        <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-6">Flow Biasing (Threshold Multipliers)</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                          <InputField label="N-S Priority Bias" type="number" value={systemConfig.adaptive_control?.rush_hour_config?.ns_bias} onChange={(v: any) => handleSystemChange("adaptive_control.rush_hour_config.ns_bias", v)} subtext="lower = more priority" />
                          <InputField label="E-W Priority Bias" type="number" value={systemConfig.adaptive_control?.rush_hour_config?.ew_bias} onChange={(v: any) => handleSystemChange("adaptive_control.rush_hour_config.ew_bias", v)} subtext="lower = more priority" />
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "priority" && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section>
                    <SectionHeader title="Influence Weights" subtitle="Direct impact on adaptive phase calculations" />
                    <div className="grid grid-cols-2 gap-6 p-6 bg-slate-800/20 rounded-2xl border border-slate-700/30">
                      <InputField label="EV Base Weight" type="number" value={systemConfig.adaptive_priority_policy?.emergency_base_weight} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.emergency_base_weight", v)} />
                      <InputField label="EV Urgent Weight" type="number" value={systemConfig.adaptive_priority_policy?.emergency_urgent_weight} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.emergency_urgent_weight", v)} />
                      <InputField label="Bus Base Weight" type="number" value={systemConfig.adaptive_priority_policy?.bus_weight_normal} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.bus_weight_normal", v)} />
                      <InputField label="Hard Streak Cap" type="number" value={systemConfig.adaptive_priority_policy?.hard_streak_cap} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.hard_streak_cap", v)} />
                      <InputField label="Recovery Bonus" type="number" value={systemConfig.adaptive_priority_policy?.recovery_bonus} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.recovery_bonus", v)} />
                      <InputField label="Ped Guard Threshold (s)" type="number" value={systemConfig.adaptive_priority_policy?.ped_guard_threshold_s} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.ped_guard_threshold_s", v)} />
                    </div>
                  </section>

                  <section>
                    <SectionHeader title="Advanced Urgency & Fairness" subtitle="Tuning the response curve for long waits" variant="secondary" />
                    <div className="grid grid-cols-3 gap-4 p-6 bg-slate-800/10 rounded-2xl border border-slate-800/30">
                      <InputField label="EV Wait Urgent (s)" type="number" value={systemConfig.adaptive_priority_policy?.emergency_wait_urgent_s} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.emergency_wait_urgent_s", v)} />
                      <InputField label="EV ETA Urgent (s)" type="number" value={systemConfig.adaptive_priority_policy?.emergency_eta_urgent_s} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.emergency_eta_urgent_s", v)} />
                      <InputField label="EV Wait Gain" type="number" value={systemConfig.adaptive_priority_policy?.emergency_wait_gain} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.emergency_wait_gain", v)} />
                      <InputField label="Bus Stress Weight" type="number" value={systemConfig.adaptive_priority_policy?.bus_weight_stress} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.bus_weight_stress", v)} />
                      <InputField label="Fairness Penalty" type="number" value={systemConfig.adaptive_priority_policy?.fairness_penalty} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.fairness_penalty", v)} />
                      <InputField label="Opposite Flow Boost" type="number" value={systemConfig.adaptive_priority_policy?.fairness_opposite_boost} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.fairness_opposite_boost", v)} />
                      <InputField label="Hysteresis steps" type="number" value={systemConfig.adaptive_priority_policy?.hysteresis_update_steps} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.hysteresis_update_steps", v)} />
                    </div>
                  </section>

                  <section>
                    <SectionHeader title="System Calibration" subtitle="Hard caps and starvation debt management" variant="secondary" />
                    <div className="grid grid-cols-3 gap-4 p-6 bg-slate-800/5 rounded-2xl border border-slate-800/20">
                      <InputField label="EV Wait Cap (s)" type="number" value={systemConfig.adaptive_priority_policy?.emergency_wait_cap_s} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.emergency_wait_cap_s", v)} />
                      <InputField label="EV ETA Floor (s)" type="number" value={systemConfig.adaptive_priority_policy?.emergency_eta_floor_s} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.emergency_eta_floor_s", v)} />
                      <InputField label="Bus Wait Gain" type="number" value={systemConfig.adaptive_priority_policy?.bus_wait_gain} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.bus_wait_gain", v)} />
                      <InputField label="Bonus Cap" type="number" value={systemConfig.adaptive_priority_policy?.direction_bonus_cap} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.direction_bonus_cap", v)} />
                      <InputField label="Streak Trigger" type="number" value={systemConfig.adaptive_priority_policy?.fairness_streak_trigger} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.fairness_streak_trigger", v)} />
                      <InputField label="Hyst. Persistence" type="number" value={systemConfig.adaptive_priority_policy?.hysteresis_persist_cycles} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.hysteresis_persist_cycles", v)} />
                      <InputField label="Ped Wait Stress (s)" type="number" value={systemConfig.adaptive_priority_policy?.stress_ped_wait_threshold_s} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.stress_ped_wait_threshold_s", v)} />
                      <InputField label="Stress Debt Limit" type="number" value={systemConfig.adaptive_priority_policy?.stress_debt_threshold} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.stress_debt_threshold", v)} />
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "preemption" && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section className="space-y-4">
                    <SectionHeader title="[PRIMARY] Critical Preemption" subtitle="Detection triggers for emergency vehicles" variant="primary" />
                    <div className="grid grid-cols-3 gap-4 p-6 bg-red-500/5 rounded-2xl border border-red-500/20">
                      <InputField label="Detection ETA" type="number" value={systemConfig.ev_preemption_policy?.detection_eta_threshold} onChange={(v: any) => handleSystemChange("ev_preemption_policy.detection_eta_threshold", v)} />
                      <InputField label="Max Search Dist" type="number" value={systemConfig.ev_preemption_policy?.max_detection_distance_m} onChange={(v: any) => handleSystemChange("ev_preemption_policy.max_detection_distance_m", v)} />
                      <InputField label="Max Hold (steps)" type="number" value={systemConfig.ev_preemption_policy?.ev_max_hold_steps} onChange={(v: any) => handleSystemChange("ev_preemption_policy.ev_max_hold_steps", v)} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <SectionHeader title="[PRIMARY] Safety Guardrails" subtitle="Ensuring preemption doesn't break the network" variant="primary" />
                    <div className="grid grid-cols-2 gap-6 p-6 bg-red-500/5 rounded-2xl border border-red-500/20">
                      <div className="space-y-4">
                        <CheckboxField label="Strict Min Green" value={systemConfig.ev_preemption_policy?.strict_min_green} onChange={(v: any) => handleSystemChange("ev_preemption_policy.strict_min_green", v)} />
                        <CheckboxField label="Ped Guard Active" value={systemConfig.ev_preemption_policy?.ped_guard_enabled} onChange={(v: any) => handleSystemChange("ev_preemption_policy.ped_guard_enabled", v)} />
                        <CheckboxField label="Bounded Preemption" value={systemConfig.ev_preemption_policy?.bounded_preemption_enabled} onChange={(v: any) => handleSystemChange("ev_preemption_policy.bounded_preemption_enabled", v)} />
                      </div>
                      <div className="space-y-4">
                        <InputField label="Preempt Min Green" type="number" value={systemConfig.ev_preemption_policy?.min_green_time_preempt} onChange={(v: any) => handleSystemChange("ev_preemption_policy.min_green_time_preempt", v)} />
                        <InputField label="Relief Window" type="number" value={systemConfig.ev_preemption_policy?.relief_window_steps} onChange={(v: any) => handleSystemChange("ev_preemption_policy.relief_window_steps", v)} />
                        <InputField label="Stale Sample Cap" type="number" value={systemConfig.ev_preemption_policy?.stale_sample_steps} onChange={(v: any) => handleSystemChange("ev_preemption_policy.stale_sample_steps", v)} />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <SectionHeader title="[SECONDARY] Fairness Arbitration" subtitle="Dynamic tuning for competing EV calls" variant="secondary" />
                    <div className="grid grid-cols-2 gap-8">
                      <div className="p-4 bg-slate-800/10 rounded-xl border border-slate-700/30">
                        <p className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest">Tightening Logic</p>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Wait Tighten" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.min_wait_tighten} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.min_wait_tighten", v)} />
                          <InputField label="Gap Tighten" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.wait_gap_tighten} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.wait_gap_tighten", v)} />
                          <InputField label="Hysteresis Base" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.hysteresis_base} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.hysteresis_base", v)} />
                        </div>
                      </div>
                      <div className="p-4 bg-slate-800/10 rounded-xl border border-slate-700/30">
                        <p className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest">Relaxation Logic</p>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Relax Ratio 1" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.pressure_ratio_relax_1} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.pressure_ratio_relax_1", v)} />
                          <InputField label="Relax Wait 1" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.min_wait_relax_1} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.min_wait_relax_1", v)} />
                          <InputField label="Relax Ratio 2" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.pressure_ratio_relax_2} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.pressure_ratio_relax_2", v)} />
                          <InputField label="Relax Wait 2" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.min_wait_relax_2} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.min_wait_relax_2", v)} />
                          <InputField label="Rev Relax Ratio" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.pressure_ratio_rev_relax} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.pressure_ratio_rev_relax", v)} />
                          <InputField label="Min Rev Relax (s)" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.min_wait_rev_relax} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.min_wait_rev_relax", v)} />
                        </div>
                      </div>
                    </div>
                    <div className="p-4 bg-slate-800/10 rounded-xl border border-slate-700/30 mt-4">
                      <p className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hysteresis & Advanced Arbitration</p>
                      <div className="grid grid-cols-4 gap-4">
                        <InputField label="Hyst Step" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.hysteresis_step} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.hysteresis_step", v)} />
                        <InputField label="Wait Hyst Tht" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.min_wait_hyst_tighten} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.min_wait_hyst_tighten", v)} />
                        <InputField label="Gap Hyst Tht" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.wait_gap_hyst_tighten} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.wait_gap_hyst_tighten", v)} />
                        <InputField label="Min Rev Tht" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.min_wait_rev_tighten} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.min_wait_rev_tighten", v)} />
                        <InputField label="Gap Rev Tht" type="number" value={systemConfig.ev_preemption_policy?.fairness_logic?.wait_gap_rev_tighten} onChange={(v: any) => handleSystemChange("ev_preemption_policy.fairness_logic.wait_gap_rev_tighten", v)} />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <SectionHeader title="[THIRD] System Calibration" subtitle="Fine-tuning detection noise & bus behavior" variant="tertiary" />
                    <div className="grid grid-cols-4 gap-4 p-6 bg-slate-800/5 rounded-2xl border border-slate-800/20">
                      <InputField label="EV Pressure Mult" type="number" value={systemConfig.ev_preemption_policy?.ev_pressure_multiplier} onChange={(v: any) => handleSystemChange("ev_preemption_policy.ev_pressure_multiplier", v)} />
                      <InputField label="Bus Det. Base" type="number" value={systemConfig.ev_preemption_policy?.bus_detection_base} onChange={(v: any) => handleSystemChange("ev_preemption_policy.bus_detection_base", v)} />
                      <InputField label="Bus Det. Queue" type="number" value={systemConfig.ev_preemption_policy?.bus_detection_queue_factor} onChange={(v: any) => handleSystemChange("ev_preemption_policy.bus_detection_queue_factor", v)} />
                      <InputField label="Bus Det. Max" type="number" value={systemConfig.ev_preemption_policy?.bus_detection_max} onChange={(v: any) => handleSystemChange("ev_preemption_policy.bus_detection_max", v)} />
                      <InputField label="Bus Wait Cap" type="number" value={systemConfig.ev_preemption_policy?.bus_wait_cap} onChange={(v: any) => handleSystemChange("ev_preemption_policy.bus_wait_cap", v)} />
                      <InputField label="Stale Dist Eps" type="number" value={systemConfig.ev_preemption_policy?.stale_distance_epsilon_m} onChange={(v: any) => handleSystemChange("ev_preemption_policy.stale_distance_epsilon_m", v)} />
                      <InputField label="Stale Speed Flr" type="number" value={systemConfig.ev_preemption_policy?.stale_speed_floor_mps} onChange={(v: any) => handleSystemChange("ev_preemption_policy.stale_speed_floor_mps", v)} />
                      <InputField label="Queue Flush Fact" type="number" value={systemConfig.ev_preemption_policy?.queue_flush_factor} onChange={(v: any) => handleSystemChange("ev_preemption_policy.queue_flush_factor", v)} />
                      <InputField label="Max Flush Dist" type="number" value={systemConfig.ev_preemption_policy?.max_flush_dist} onChange={(v: any) => handleSystemChange("ev_preemption_policy.max_flush_dist", v)} />
                      <InputField label="Max Tracking ETA" type="number" value={systemConfig.ev_preemption_policy?.max_eta_s} onChange={(v: any) => handleSystemChange("ev_preemption_policy.max_eta_s", v)} />
                      <InputField label="Ped Max Red (s)" type="number" value={systemConfig.ev_preemption_policy?.ped_max_red_steps} onChange={(v: any) => handleSystemChange("ev_preemption_policy.ped_max_red_steps", v)} />
                      <InputField label="Stale Cooldown" type="number" value={systemConfig.ev_preemption_policy?.stale_reject_cooldown_steps} onChange={(v: any) => handleSystemChange("ev_preemption_policy.stale_reject_cooldown_steps", v)} />
                    </div>
                    <div className="p-4 bg-slate-800/5 rounded-xl border border-slate-800/10 mt-4">
                      <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-[0.2em]">Maintenance Floors & Debt</p>
                      <div className="grid grid-cols-4 gap-4">
                        <InputField label="Floor ETA" type="number" value={systemConfig.ev_preemption_policy?.emergency_floor_eta_s} onChange={(v: any) => handleSystemChange("ev_preemption_policy.emergency_floor_eta_s", v)} />
                        <InputField label="Floor Dist" type="number" value={systemConfig.ev_preemption_policy?.emergency_floor_distance_m} onChange={(v: any) => handleSystemChange("ev_preemption_policy.emergency_floor_distance_m", v)} />
                        <InputField label="Floor Wait" type="number" value={systemConfig.ev_preemption_policy?.emergency_floor_wait_s} onChange={(v: any) => handleSystemChange("ev_preemption_policy.emergency_floor_wait_s", v)} />
                        <InputField label="Handoff Steps" type="number" value={systemConfig.ev_preemption_policy?.layer_handoff_cooldown_steps} onChange={(v: any) => handleSystemChange("ev_preemption_policy.layer_handoff_cooldown_steps", v)} />
                        <InputField label="Reacquire Steps" type="number" value={systemConfig.ev_preemption_policy?.ev_reacquire_cooldown_steps} onChange={(v: any) => handleSystemChange("ev_preemption_policy.ev_reacquire_cooldown_steps", v)} />
                        <InputField label="Opp-Halt Relief" type="number" value={systemConfig.ev_preemption_policy?.relief_min_opposite_halting} onChange={(v: any) => handleSystemChange("ev_preemption_policy.relief_min_opposite_halting", v)} />
                        <InputField label="Debt Trigger" type="number" value={systemConfig.ev_preemption_policy?.starvation_debt_trigger} onChange={(v: any) => handleSystemChange("ev_preemption_policy.starvation_debt_trigger", v)} />
                        <InputField label="Starve Debt Gain" type="number" value={systemConfig.ev_preemption_policy?.starvation_debt_gain_per_step} onChange={(v: any) => handleSystemChange("ev_preemption_policy.starvation_debt_gain_per_step", v)} />
                        <InputField label="Starve Debt Decay" type="number" value={systemConfig.ev_preemption_policy?.starvation_debt_decay_per_step} onChange={(v: any) => handleSystemChange("ev_preemption_policy.starvation_debt_decay_per_step", v)} />
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "pedestrians" && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section>
                    <SectionHeader title="Pedestrian Importance" subtitle="Balancing foot traffic with vehicles" />
                    <div className="grid grid-cols-2 gap-6 p-6 bg-slate-800/20 rounded-2xl border border-slate-700/30">
                      <div className="col-span-2">
                        <label className="text-sm font-bold text-sky-600 dark:text-sky-500 uppercase tracking-widest mb-2 block">Active Weighting Mode</label>
                        <select
                          value={systemConfig.pedestrian_control?.active_mode || "balanced"}
                          onChange={(e) => handleSystemChange("pedestrian_control.active_mode", e.target.value)}
                          className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-sky-500/50 outline-none"
                        >
                          <option value="vehicle_first">Vehicle First (Zero Ped Influence)</option>
                          <option value="balanced">Balanced (Normal Weight)</option>
                          <option value="pedestrian_first">Pedestrian First (Max Influence)</option>
                        </select>
                      </div>
                      <InputField label="Wait Threshold (s)" type="number" value={systemConfig.pedestrian_control?.priority_threshold} onChange={(v: any) => handleSystemChange("pedestrian_control.priority_threshold", v)} />
                      <InputField label="Max Duration (s)" type="number" value={systemConfig.pedestrian_control?.max_ped_phase_duration} onChange={(v: any) => handleSystemChange("pedestrian_control.max_ped_phase_duration", v)} />
                      <InputField label="Extension/Ped (s)" type="number" value={systemConfig.pedestrian_control?.extension_per_ped} onChange={(v: any) => handleSystemChange("pedestrian_control.extension_per_ped", v)} />
                      <InputField label="Balanced Weight" type="number" value={systemConfig.pedestrian_control?.weight_balanced} onChange={(v: any) => handleSystemChange("pedestrian_control.weight_balanced", v)} />
                      <InputField label="Ped First Weight" type="number" value={systemConfig.pedestrian_control?.weight_pedestrian_first} onChange={(v: any) => handleSystemChange("pedestrian_control.weight_pedestrian_first", v)} />
                      <InputField label="Vehicle First Weight" type="number" value={systemConfig.pedestrian_control?.weight_vehicle_first} onChange={(v: any) => handleSystemChange("pedestrian_control.weight_vehicle_first", v)} />
                    </div>
                  </section>

                  <section>
                    <SectionHeader title="Pedestrian Fine-Tuning" subtitle="Timing and clearance safety" variant="secondary" />
                    <div className="grid grid-cols-3 gap-4 p-6 bg-slate-800/10 rounded-2xl border border-slate-800/30">
                      <InputField label="Clearance Time (s)" type="number" value={systemConfig.pedestrian_control?.clearance_time} onChange={(v: any) => handleSystemChange("pedestrian_control.clearance_time", v)} />
                      <InputField label="Cooldown (s)" type="number" value={systemConfig.pedestrian_control?.cooldown} onChange={(v: any) => handleSystemChange("pedestrian_control.cooldown", v)} />
                      <InputField label="Base Duration (s)" type="number" value={systemConfig.pedestrian_control?.base_duration} onChange={(v: any) => handleSystemChange("pedestrian_control.base_duration", v)} />
                      <InputField label="Safety Min Green" type="number" value={systemConfig.pedestrian_control?.ped_safety_min_green} onChange={(v: any) => handleSystemChange("pedestrian_control.ped_safety_min_green", v)} />
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "environment" && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section>
                    <SectionHeader title="Environmental Policy" subtitle="Sustainable Logic and Emissions Reduction Tuning" />
                    <div className="grid grid-cols-2 gap-4 p-6 bg-slate-800/10 rounded-2xl border border-slate-800/30">
                      <InputField label="Zero Waste Mult." type="number" value={systemConfig.adaptive_control?.no_preempt_policy?.zero_waste_multiplier} onChange={(v: any) => handleSystemChange("adaptive_control.no_preempt_policy.zero_waste_multiplier", v)} />
                      <InputField label="Guard Suppression" type="number" value={systemConfig.adaptive_priority_policy?.ped_guard_suppression} onChange={(v: any) => handleSystemChange("adaptive_priority_policy.ped_guard_suppression", v)} />
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "execution" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section>
                    <SectionHeader title="Execution Hub" subtitle="Launch simulation engine with custom flags" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-800/20 rounded-2xl border border-slate-700/30 mb-8">
                      <SelectField
                        label="Simulation Mode"
                        value={executionOptions.mode}
                        onChange={(v: string) => setExecutionOptions({ ...executionOptions, mode: v })}
                        options={[
                          { label: "Generic (Random)", value: "generic" },
                          { label: "Real Data (JSON)", value: "real" }
                        ]}
                      />
                      {executionOptions.mode === "real" && (
                        <SelectField
                          label="Traffic Source"
                          value={executionOptions.realTrafficSource}
                          onChange={(v: string) => setExecutionOptions({ ...executionOptions, realTrafficSource: v })}
                          options={[
                            { label: "Synthetic Ingestion", value: "synthetic" },
                            { label: "Live Stream", value: "stream" }
                          ]}
                        />
                      )}
                      <SelectField
                        label="Pedestrian Priority Mode"
                        value={executionOptions.pedMode}
                        onChange={(v: string) => setExecutionOptions({ ...executionOptions, pedMode: v })}
                        enabled={executionOptions.usePedMode}
                        onToggle={(v: boolean) => setExecutionOptions({ ...executionOptions, usePedMode: v })}
                        options={[
                          { label: "Vehicle First", value: "vehicle_first" },
                          { label: "Balanced", value: "balanced" },
                          { label: "Pedestrian First", value: "pedestrian_first" }
                        ]}
                      />
                      <InputField
                        label="Simulation Horizon (s)"
                        type="number"
                        value={executionOptions.simTime}
                        onChange={(v: any) => setExecutionOptions({ ...executionOptions, simTime: v })}
                        enabled={executionOptions.useSimTime}
                        onToggle={(v: boolean) => setExecutionOptions({ ...executionOptions, useSimTime: v })}
                      />
                      <InputField
                        label="GUI Rotation (deg)"
                        type="number"
                        value={executionOptions.guiRotateDeg}
                        onChange={(v: any) => setExecutionOptions({ ...executionOptions, guiRotateDeg: v })}
                        enabled={executionOptions.useGui}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-slate-800/5 rounded-2xl border border-slate-700/30 mb-8">
                      <CheckboxField label="Run with GUI" value={executionOptions.useGui} onChange={(v: boolean) => setExecutionOptions({ ...executionOptions, useGui: v })} />
                      <CheckboxField label="Early Stop on Degrade" value={executionOptions.earlyStop} onChange={(v: boolean) => setExecutionOptions({ ...executionOptions, earlyStop: v })} />
                      <CheckboxField label="Benchmark Mode" value={executionOptions.benchmarkMode} onChange={(v: boolean) => setExecutionOptions({ ...executionOptions, benchmarkMode: v })} />
                    </div>

                    <div className="mb-8">
                      <SectionHeader title="Scenario Selection" subtitle="Choose specific configurations to include in this run" variant="secondary" />
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-6 bg-slate-800/10 rounded-2xl border border-slate-700/30">
                        {[
                          { id: "fixed_no_preempt", label: "Fixed (Basic)" },
                          { id: "fixed_with_preempt", label: "Fixed + EV Preemption" },
                          { id: "adaptive_no_preempt", label: "Adaptive (Basic)" },
                          { id: "adaptive_weighted", label: "Adaptive + Priority System" },
                          { id: "adaptive_with_preempt", label: "Adaptive + EV Preemption" },
                          { id: "adaptive_weighted_with_preempt", label: "Adaptive + Priority System + EV Preemption" }
                        ].map(cfg => (
                          <label key={cfg.id} className="flex items-center gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={executionOptions.includeConfigs.includes(cfg.id)}
                              onChange={(e) => {
                                const newConfigs = e.target.checked
                                  ? [...executionOptions.includeConfigs, cfg.id]
                                  : executionOptions.includeConfigs.filter((id: string) => id !== cfg.id);
                                setExecutionOptions({ ...executionOptions, includeConfigs: newConfigs });
                              }}
                              className="hidden"
                            />
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${executionOptions.includeConfigs.includes(cfg.id) ? 'bg-green-500 border-green-400' : 'bg-slate-800 border-slate-700 group-hover:border-slate-500'}`}>
                              {executionOptions.includeConfigs.includes(cfg.id) && <Icons.Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{cfg.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <SectionHeader title="Run Command" subtitle="Constructed based on selected flags" variant="secondary" />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Manual Edit</span>
                          <button
                            onClick={() => setIsManualExecution(!isManualExecution)}
                            className={`w-10 h-5 rounded-full transition-all relative ${isManualExecution ? 'bg-amber-500' : 'bg-slate-700'}`}
                          >
                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all ${isManualExecution ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={customCommand}
                        onChange={(e) => isManualExecution && setCustomCommand(e.target.value)}
                        readOnly={!isManualExecution}
                        className={`w-full h-24 bg-slate-950/50 border border-slate-800 rounded-2xl p-4 font-mono text-xs ${isManualExecution ? 'text-amber-400' : 'text-stone-100'} focus:ring-2 focus:ring-green-500/30 outline-none`}
                      />
                    </div>
                  </section>

                  <div className="p-8 bg-slate-950/50 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
                    <style>{`
                      @keyframes stripe-slide {
                        from { background-position: 1rem 0; }
                        to { background-position: 0 0; }
                      }
                      @keyframes blink {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0; }
                      }
                    `}</style>
                    <div className="flex items-center gap-8 relative z-10">
                      <button onClick={simStatus.isRunning ? handleStopSimulation : handleStartSimulation} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${simStatus.isRunning ? 'bg-rose-500 hover:bg-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.4)]' : 'bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]'}`}>
                        {simStatus.isRunning ? <Icons.Stop /> : <Icons.Play />}
                      </button>
                      <div className="flex-1 space-y-4">
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              Simulation Progress
                              {simStatus.isRunning && <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span></span>}
                            </p>
                            <p className="text-xl font-bold text-slate-100">{simStatus.isRunning ? "Simulating..." : "Idle"}</p>
                          </div>
                          <p className="text-3xl font-bold text-emerald-400 font-mono drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">{simStatus.progress}%</p>
                        </div>
                        <div className="h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50 shadow-inner">
                          <div className="h-full relative transition-all duration-500 ease-out" style={{ width: `${simStatus.progress}%`, backgroundColor: '#0ea5e9' }}>
                            <div className="absolute inset-0 opacity-50"
                              style={{
                                backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent)',
                                backgroundSize: '1rem 1rem',
                                animation: simStatus.isRunning ? 'stripe-slide 1s linear infinite' : 'none'
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div ref={consoleContainerRef} className="mt-8 bg-[#0a0a0a] rounded-xl border border-slate-800 p-4 font-mono text-xs h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 shadow-inner relative z-10">
                      {simStatus.logs.length === 0 && <p className="text-slate-500 italic">Waiting for command...</p>}
                      {simStatus.logs.map((log, i) => (
                        <div key={i} className={`mb-1.5 leading-relaxed ${log.includes("ERROR") ? "text-rose-400 font-semibold" : "text-emerald-400"}`}>
                          <span className="text-slate-600 mr-2 select-none">❯</span>
                          <span className="opacity-90">{log}</span>
                        </div>
                      ))}
                      {simStatus.isRunning && (
                        <div className="mt-2 text-emerald-400 flex items-center gap-2">
                          <span className="text-slate-600 select-none">❯</span>
                          <span className="inline-block w-2 h-3 bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.6)]" style={{ animation: "blink 1s step-end infinite" }}></span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-8 border-t border-slate-800/50">
                    <SectionHeader title="Cloud Persistence" subtitle="Upload results, network, and system configs to MongoDB Atlas" />
                    <div className="flex flex-col gap-4">
                      <button
                        onClick={handleExportResults}
                        disabled={dbExportStatus.loading || simStatus.isRunning}
                        className={`flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-xl ${dbExportStatus.loading || simStatus.isRunning
                          ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                          }`}
                      >
                        {dbExportStatus.loading ? (
                          <div className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                        ) : <Icons.Cloud />}
                        <span>{dbExportStatus.loading ? "Uploading to Atlas..." : "Upload Last Run to Cloud Atlas"}</span>
                      </button>

                      {dbExportStatus.error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm font-medium">
                          ⚠️ {dbExportStatus.error}
                        </div>
                      )}
                      {dbExportStatus.success && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-medium">
                          ✅ {dbExportStatus.success}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "optimizer" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section>
                    <SectionHeader title="Optimizer Hub" subtitle="Configure and launch Rapid Grid Search" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-800/20 rounded-2xl border border-slate-700/30">
                      <SelectField
                        label="Optimization Mode"
                        value={optimizerOptions.mode}
                        onChange={(v: string) => setOptimizerOptions({ ...optimizerOptions, mode: v })}
                        options={[
                          { label: "Generic (LHS Grid)", value: "generic" },
                          { label: "Real World (Stream)", value: "real" }
                        ]}
                      />
                      {optimizerOptions.mode === "real" && (
                        <SelectField
                          label="Traffic Source"
                          value={optimizerOptions.realTrafficSource}
                          onChange={(v: string) => setOptimizerOptions({ ...optimizerOptions, realTrafficSource: v })}
                          options={[
                            { label: "Synthetic Ingestion", value: "synthetic" },
                            { label: "Live Stream", value: "stream" }
                          ]}
                        />
                      )}
                      <SelectField
                        label="Objective Goal"
                        value={optimizerOptions.goal}
                        onChange={(v: string) => setOptimizerOptions({ ...optimizerOptions, goal: v })}
                        options={[
                          { label: "All Goals (Automated Sweep)", value: "all" },
                          { label: "Balanced", value: "balanced" },
                          { label: "Eco-Friendly", value: "eco" },
                          { label: "Max Throughput", value: "throughput" },
                          { label: "EV Focus", value: "ev_focus" },
                          { label: "Pedestrian Focus", value: "ped_focus" },
                          { label: "Fluidity (Stops)", value: "fluidity" },
                          { label: "All Vehicles Focus", value: "veh_focus" },
                          { label: "Ped & Veh Focus", value: "ped_veh_focus" }
                        ]}
                      />
                      <SelectField
                        label="Baseline Configuration"
                        value={optimizerOptions.baselineName}
                        onChange={(v: string) => setOptimizerOptions({ ...optimizerOptions, baselineName: v })}
                        options={[
                          { label: "Fixed (No Preemption) Configuration", value: "fixed no preempt" },
                          ...availableConfigs.baseConfigs
                            .filter(bc => bc.id !== "fixed_no_preempt" && bc.id !== "fixed no preempt")
                            .map(bc => ({
                              label: bc.name.toLowerCase().includes("configuration") ? bc.name : `${bc.name} Configuration`,
                              value: bc.id
                            }))
                        ]}
                      />
                      <SelectField
                        label="Base Config to Optimize"
                        value={optimizerOptions.optimizeConfig}
                        onChange={(v: string) => setOptimizerOptions({ ...optimizerOptions, optimizeConfig: v })}
                        options={[
                          { label: "Adaptive Weighted With Preempt (Default)", value: "adaptive_weighted_with_preempt" },
                          { label: "Adaptive Weighted (No Preempt)", value: "adaptive_weighted" },
                          { label: "Adaptive With Preempt (Unweighted)", value: "adaptive_with_preempt" },
                          { label: "Adaptive No Preempt (Unweighted)", value: "adaptive_no_preempt" },
                        ]}
                      />
                    </div>
                  </section>

                  <section>
                    <SectionHeader title="Search Constraints" subtitle="Simulation horizons and safety bounds" variant="secondary" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 p-6 bg-slate-800/10 rounded-2xl border border-slate-700/30">
                      <InputField label="Ph1: Coarse Search (s)" type="number" value={optimizerOptions.phase1SimTime} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, phase1SimTime: v })} />
                      <InputField label="Ph2: Fine Refine (s)" type="number" value={optimizerOptions.phase2SimTime} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, phase2SimTime: v })} />
                      <InputField label="Ped Delay Limit (%)" type="number" value={optimizerOptions.maxPedWorsenPct} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, maxPedWorsenPct: v })} enabled={optimizerOptions.useMaxPedWorsenPct} onToggle={(v: boolean) => setOptimizerOptions({ ...optimizerOptions, useMaxPedWorsenPct: v })} />
                      <InputField label="Max Starvation" type="number" value={optimizerOptions.maxStarvation} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, maxStarvation: v })} enabled={optimizerOptions.useMaxStarvation} onToggle={(v: boolean) => setOptimizerOptions({ ...optimizerOptions, useMaxStarvation: v })} />
                      <InputField label="Spillback Cap" type="number" value={optimizerOptions.maxQueueCap} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, maxQueueCap: v })} enabled={optimizerOptions.useMaxQueueCap} onToggle={(v: boolean) => setOptimizerOptions({ ...optimizerOptions, useMaxQueueCap: v })} />
                      <InputField label="Max Vehicle Delay (s)" type="number" value={optimizerOptions.patienceCap} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, patienceCap: v })} enabled={optimizerOptions.usePatienceCap} onToggle={(v: boolean) => setOptimizerOptions({ ...optimizerOptions, usePatienceCap: v })} />
                      <InputField label="Meta Opt Rounds" type="number" value={optimizerOptions.metaStages} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaStages: v })} enabled={optimizerOptions.useMetaStages} onToggle={(v: boolean) => setOptimizerOptions({ ...optimizerOptions, useMetaStages: v })} />
                    </div>
                  </section>
                  <section>
                    <SectionHeader
                      title="Meta Scaling Search Space"
                      subtitle="Define multiplier ranges for volume profiles"
                      variant="secondary"
                      enabled={optimizerOptions.useMetaScaling}
                      onToggle={(v: boolean) => setOptimizerOptions({ ...optimizerOptions, useMetaScaling: v })}
                    />
                    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10 p-8 bg-slate-800/10 rounded-2xl border border-slate-700/30 transition-opacity duration-300 ${!optimizerOptions.useMetaScaling ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-sky-500 uppercase tracking-[0.2em] bg-sky-500/5 py-1 px-3 rounded-md w-fit border border-sky-500/20">High Switch Range</p>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Min" type="number" value={optimizerOptions.metaHighSwitchMin} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaHighSwitchMin: v })} />
                          <InputField label="Max" type="number" value={optimizerOptions.metaHighSwitchMax} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaHighSwitchMax: v })} />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-sky-500 uppercase tracking-[0.2em] bg-sky-500/5 py-1 px-3 rounded-md w-fit border border-sky-500/20">High Bonus Range</p>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Min" type="number" value={optimizerOptions.metaHighBonusMin} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaHighBonusMin: v })} />
                          <InputField label="Max" type="number" value={optimizerOptions.metaHighBonusMax} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaHighBonusMax: v })} />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-sky-500 uppercase tracking-[0.2em] bg-sky-500/5 py-1 px-3 rounded-md w-fit border border-sky-500/20">High Starv Range</p>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Min" type="number" value={optimizerOptions.metaHighStarvMin} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaHighStarvMin: v })} />
                          <InputField label="Max" type="number" value={optimizerOptions.metaHighStarvMax} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaHighStarvMax: v })} />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] bg-slate-400/5 py-1 px-3 rounded-md w-fit border border-slate-500/20">Low Switch Range</p>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Min" type="number" value={optimizerOptions.metaLowSwitchMin} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaLowSwitchMin: v })} />
                          <InputField label="Max" type="number" value={optimizerOptions.metaLowSwitchMax} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaLowSwitchMax: v })} />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] bg-slate-400/5 py-1 px-3 rounded-md w-fit border border-slate-500/20">Low Bonus Range</p>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Min" type="number" value={optimizerOptions.metaLowBonusMin} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaLowBonusMin: v })} />
                          <InputField label="Max" type="number" value={optimizerOptions.metaLowBonusMax} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaLowBonusMax: v })} />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] bg-slate-400/5 py-1 px-3 rounded-md w-fit border border-slate-500/20">Low Starv Range</p>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="Min" type="number" value={optimizerOptions.metaLowStarvMin} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaLowStarvMin: v })} />
                          <InputField label="Max" type="number" value={optimizerOptions.metaLowStarvMax} onChange={(v: any) => setOptimizerOptions({ ...optimizerOptions, metaLowStarvMax: v })} />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <SectionHeader title="Behavioral Flags" subtitle="Optimization guardrails" variant="secondary" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-slate-800/5 rounded-2xl border border-slate-700/30">
                      <CheckboxField label="Apply Safety Parameter Clamping" value={optimizerOptions.safeGuard} onChange={(v: boolean) => setOptimizerOptions({ ...optimizerOptions, safeGuard: v })} />
                      <CheckboxField label="Zero Starvation Tolerance (Strict)" value={optimizerOptions.strictStarvation} onChange={(v: boolean) => setOptimizerOptions({ ...optimizerOptions, strictStarvation: v })} />
                      <CheckboxField label="Force Baseline Re-Evaluation" value={optimizerOptions.refreshBaseline} onChange={(v: boolean) => setOptimizerOptions({ ...optimizerOptions, refreshBaseline: v })} />
                      <CheckboxField label="Detailed Performance Benchmarking" value={optimizerOptions.benchmarkMode} onChange={(v: boolean) => setOptimizerOptions({ ...optimizerOptions, benchmarkMode: v })} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="flex justify-between items-center">
                      <SectionHeader title="Active Optimization Stages" subtitle={stageSelectionMode === "auto" ? "Automatically focused based on selected goal" : "Manually select which policies to tune"} variant="secondary" />
                      <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700 shadow-inner">
                        <button
                          onClick={() => setStageSelectionMode("auto")}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${stageSelectionMode === "auto" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30" : "text-slate-400 hover:text-slate-200"}`}
                        >
                          Auto (Goal-Based)
                        </button>
                        <button
                          onClick={() => setStageSelectionMode("manual")}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${stageSelectionMode === "manual" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30" : "text-slate-400 hover:text-slate-200"}`}
                        >
                          Manual (Custom)
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 p-6 bg-slate-800/5 rounded-2xl border border-slate-700/30">
                      {["priority", "adaptive", "ev_preemption", "meta"].map(stage => {
                        const goalStageMap: Record<string, string[]> = {
                          ev_focus: ["ev_preemption", "meta"],
                          ped_focus: ["priority", "meta"],
                          eco: ["priority", "adaptive", "meta"],
                          low_congestion: ["priority", "adaptive", "meta"],
                          fluidity: ["priority", "adaptive", "meta"],
                          throughput: ["priority", "adaptive", "meta"],
                          veh_focus: ["priority", "adaptive", "meta"],
                          ped_veh_focus: ["priority", "adaptive", "meta"],
                          balanced: ["priority", "adaptive", "meta"],
                        };
                        const activeStages = stageSelectionMode === "auto"
                          ? (goalStageMap[optimizerOptions.goal] || ["priority", "adaptive", "meta"])
                          : optimizerOptions.includeStages;
                        const isChecked = activeStages.includes(stage);

                        return (
                          <label key={stage} className={`flex items-center gap-2 ${stageSelectionMode === "auto" ? "cursor-default opacity-80" : "cursor-pointer group"}`}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={stageSelectionMode === "auto"}
                              onChange={(e) => {
                                if (stageSelectionMode === "auto") return;
                                const newStages = e.target.checked
                                  ? [...optimizerOptions.includeStages, stage]
                                  : optimizerOptions.includeStages.filter((s: string) => s !== stage);
                                setOptimizerOptions({ ...optimizerOptions, includeStages: newStages });
                              }}
                              className="hidden"
                            />
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${isChecked ? 'bg-sky-500 border-sky-400' : 'bg-slate-800 border-slate-700 (stageSelectionMode === "manual" ? "group-hover:border-slate-500" : "")'}`}>
                              {isChecked && <Icons.Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <span className="text-sm font-medium capitalize text-slate-700 dark:text-slate-200 flex items-center gap-2">
                              {stage === "priority" ? "Priority Logic" :
                                stage === "adaptive" ? "Adaptive Control" :
                                  stage === "ev_preemption" ? "EV Preemption" :
                                    "Meta Optimization"}
                              {stageSelectionMode === "auto" && isChecked && (
                                <span className="text-[10px] text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">Auto</span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="flex justify-between items-center">
                      <SectionHeader title="Generated Command" subtitle="Constructed based on selected flags" />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Manual Edit</span>
                        <button
                          onClick={() => setIsManualOptimizer(!isManualOptimizer)}
                          className={`w-10 h-5 rounded-full transition-all relative ${isManualOptimizer ? 'bg-amber-500' : 'bg-slate-700'}`}
                        >
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all ${isManualOptimizer ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={optimizerCommand}
                      onChange={(e) => isManualOptimizer && setOptimizerCommand(e.target.value)}
                      readOnly={!isManualOptimizer}
                      className={`w-full h-24 bg-slate-950/50 border border-slate-800 rounded-2xl p-4 font-mono text-xs ${isManualOptimizer ? 'text-amber-400' : 'text-stone-100'} focus:ring-2 focus:ring-sky-500/30 outline-none`}
                    />
                  </section>

                  <div className="p-8 bg-slate-950/50 rounded-3xl border border-slate-800 shadow-2xl">
                    <div className="flex items-center gap-8">
                      <button onClick={simStatus.isRunning ? handleStopSimulation : handleStartOptimizer} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${simStatus.isRunning ? 'bg-rose-500 hover:bg-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.4)]' : 'bg-sky-500 hover:bg-sky-400 shadow-[0_0_20px_rgba(14,165,233,0.4)]'}`}>
                        {simStatus.isRunning ? <Icons.Stop /> : <Icons.Play />}
                      </button>
                      <div className="flex-1 space-y-4">
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Optimizer Status</p>
                            <p className="text-xl font-bold text-slate-100">{getOptimizerStatusLabel()}</p>
                          </div>
                          <p className="text-3xl font-bold text-sky-400 font-mono">{simStatus.progress}%</p>
                        </div>
                        <div className="h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50 shadow-inner">
                          <div className="h-full relative transition-all duration-500 ease-out" style={{ width: `${simStatus.progress}%`, backgroundColor: '#0ea5e9' }} />
                        </div>
                      </div>
                    </div>

                    <div ref={consoleContainerRef} className="mt-8 bg-[#0a0a0a] rounded-xl border border-slate-800 p-4 font-mono text-[10px] h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 shadow-inner">
                      {simStatus.logs.length === 0 && <p className="text-slate-600 italic">Logs will appear here...</p>}
                      {simStatus.logs.map((log, i) => (
                        <div key={i} className="mb-1 text-emerald-500/80">
                          <span className="text-slate-700 mr-2">❯</span>
                          <span>{log}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-8 border-t border-slate-800/50">
                    <SectionHeader title="Cloud Persistence" subtitle="Upload results, network, and system configs to MongoDB Atlas" />
                    <div className="flex flex-col gap-4">
                      <button
                        onClick={handleExportResults}
                        disabled={dbExportStatus.loading || simStatus.isRunning}
                        className={`flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-xl ${dbExportStatus.loading || simStatus.isRunning
                          ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                          }`}
                      >
                        {dbExportStatus.loading ? (
                          <div className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                        ) : <Icons.Cloud />}
                        <span>{dbExportStatus.loading ? "Uploading to Atlas..." : "Upload Last Run to Cloud Atlas"}</span>
                      </button>

                      {dbExportStatus.error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm font-medium">
                          ⚠️ {dbExportStatus.error}
                        </div>
                      )}
                      {dbExportStatus.success && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-medium">
                          ✅ {dbExportStatus.success}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "opt_winners" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">

                  <div className="p-8 bg-slate-900/40 rounded-3xl border border-slate-700/30 shadow-2xl space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">

                      <div>
                        <h3 className="text-xl font-bold text-slate-100 flex items-center gap-3">
                          <span className="text-2xl">🏆</span> Multi-Goal Optimization Winners
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Dynamically tuned controller profiles persisted per objective goal from rapid grid search sweeps
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700 shadow-inner">
                          <button
                            onClick={() => setOptWinnersFilter("active")}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${optWinnersFilter === "active" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30" : "text-slate-400 hover:text-slate-200"}`}
                          >
                            Active Goal ({optimizerOptions.goal})
                          </button>
                          <button
                            onClick={() => setOptWinnersFilter("all")}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${optWinnersFilter === "all" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30" : "text-slate-400 hover:text-slate-200"}`}
                          >
                            All Goals ({optConfigData?.optimized_profiles_by_goal ? Object.keys(optConfigData.optimized_profiles_by_goal).length : 0})
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                setIsRefreshingOpt(true);
                                const res = await fetch(`/api/simulation-dashboard/optimization-config?t=${Date.now()}`);
                                setOptConfigData(await res.json());
                                setTimeout(() => setIsRefreshingOpt(false), 600);
                              } catch (err) {
                                console.error("Failed to refresh opt config", err);
                                setIsRefreshingOpt(false);
                              }
                            }}
                            disabled={isRefreshingOpt}
                            title="Refresh Profiles"
                            className="p-2 hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                          >
                            <Icons.Refresh className={isRefreshingOpt ? "animate-spin text-sky-400" : ""} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {optConfigData?.optimized_profiles_by_goal && Object.keys(optConfigData.optimized_profiles_by_goal).length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Object.entries(optConfigData.optimized_profiles_by_goal)
                          .filter(([goalKey]) => optWinnersFilter === "all" || goalKey === optimizerOptions.goal)
                          .map(([goalKey, profileData]: [string, any]) => (
                          <div key={goalKey} className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between hover:border-sky-500/50 transition-all duration-300 group shadow-xl">
                            <div>
                              <div className="flex justify-between items-start mb-4">
                                <span className="px-3 py-1 bg-sky-500/10 border border-sky-500/30 text-sky-400 font-bold uppercase tracking-wider text-[10px] rounded-full shadow-inner">
                                  {goalKey}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  {profileData.timestamp ? new Date(profileData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-slate-200 group-hover:text-sky-400 transition-colors mb-3 flex items-center gap-2">
                                <span>{profileData.name}</span>
                              </h4>
                              <div className="bg-[#0a0a0a] rounded-xl p-3 border border-slate-800/80 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 font-mono text-[10px] text-slate-400 space-y-1.5 shadow-inner">
                                {Object.entries(profileData.profile || {}).map(([pK, pV]: [string, any]) => (
                                  <div key={pK} className="flex flex-col border-b border-slate-900/60 pb-1.5 last:border-0 last:pb-0">
                                    <span className="text-slate-500 font-bold tracking-wide">{pK}:</span>
                                    <span className="text-emerald-400 pl-2 overflow-x-auto whitespace-pre-wrap scrollbar-none font-semibold">
                                      {typeof pV === 'object' ? JSON.stringify(pV, null, 2) : String(pV)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="mt-5 pt-3 border-t border-slate-900 flex justify-end items-center">
                              <button
                                onClick={async () => {
                                  try {

                                    const updatedConfig = JSON.parse(JSON.stringify(systemConfig || {}));
                                    const prof = profileData.profile || {};

                                    if (prof.soft_priority_profile) {
                                      updatedConfig.adaptive_priority_policy = { ...(updatedConfig.adaptive_priority_policy || {}), ...prof.soft_priority_profile };
                                    }

                                    if (prof.adaptive_no_preempt_profile) {
                                      if (!updatedConfig.adaptive_control) updatedConfig.adaptive_control = {};
                                      updatedConfig.adaptive_control.no_preempt_policy = { ...(updatedConfig.adaptive_control.no_preempt_policy || {}), ...prof.adaptive_no_preempt_profile };
                                    }

                                    ["adaptive_control", "ev_preemption_policy", "pedestrian_control"].forEach(sec => {
                                      if (prof[sec]) {
                                        updatedConfig[sec] = { ...(updatedConfig[sec] || {}), ...prof[sec] };
                                      }
                                    });
                                    if (prof.dynamic_red_profile) {
                                      if (!updatedConfig.adaptive_control) updatedConfig.adaptive_control = {};
                                      updatedConfig.adaptive_control.dynamic_max_red = { ...(updatedConfig.adaptive_control.dynamic_max_red || {}), ...prof.dynamic_red_profile };
                                    }
                                    if (prof.preemption_profile) {
                                      updatedConfig.ev_preemption_policy = { ...(updatedConfig.ev_preemption_policy || {}), ...prof.preemption_profile };
                                    }
                                    if (prof.ped_profile?.ped_priority_threshold) {
                                      if (!updatedConfig.pedestrian_control) updatedConfig.pedestrian_control = {};
                                      updatedConfig.pedestrian_control.priority_threshold = Number(prof.ped_profile.ped_priority_threshold);
                                    }

                                    await fetch("/api/simulation-dashboard/system-param", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify(updatedConfig)
                                    });

                                    setSystemConfig(updatedConfig);
                                    setOptimizerOptions((prev: any) => ({ ...prev, goal: goalKey }));

                                    alert(`Successfully loaded ${goalKey.toUpperCase()} profile (${profileData.name}) into active System Parameters!\n\nTo view the traffic charts for this goal, switch to the Execution Hub and click Play to run the simulation with these optimized parameters.`);
                                  } catch (err) {
                                    console.error("Failed to load profile into system config", err);
                                    alert("Failed to load profile into system config.");
                                  }
                                }}
                                className="text-[10px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors py-1 px-2 rounded-lg hover:bg-sky-500/10"
                              >
                                Load Goal Profile ❯
                              </button>

                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-12 text-center text-slate-500 bg-slate-950/30 rounded-2xl border border-dashed border-slate-800 flex flex-col items-center justify-center gap-3">
                        <span className="text-4xl mb-1">📭</span>
                        <p className="font-medium text-slate-400">No goal-specific optimized profiles found.</p>
                        <p className="text-xs text-slate-600 max-w-md">Run an optimization sweep using the controls above to populate winning controller configurations for each objective.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "goal_benchmarks" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="p-8 bg-slate-900/40 rounded-3xl border border-slate-700/30 shadow-2xl space-y-8">

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800/80 pb-6">
                      <div>
                        <h3 className="text-2xl font-extrabold text-slate-100 flex items-center gap-3 tracking-tight">
                          <span className="text-3xl">🏟️</span> Multi-Goal Matrix & Benchmark Arena
                        </h3>
                        <p className="text-xs text-slate-300/90 leading-relaxed font-medium mt-1 max-w-2xl">
                          Comprehensive 48-mode simulation matrix comparing all 7 optimized goal profiles across all 6 controller configurations and all internal tuning variables.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-start md:justify-end self-stretch md:self-auto">
                        <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/80 rounded-xl px-3 py-2 shadow-inner">
                          <span className="text-xs font-bold text-slate-300 whitespace-nowrap">Sim Time:</span>
                          <select
                            value={matrixSimTime}
                            onChange={(e) => setMatrixSimTime(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-sky-400 focus:outline-none focus:border-sky-500"
                          >
                            <option value="360">360s (Fast)</option>
                            <option value="720">720s (Default)</option>
                            <option value="1800">1800s (Extended)</option>
                            <option value="all">All Data (Full Stream)</option>
                          </select>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              setMatrixRefreshStatus({ loading: true, success: false });
                              const res = await fetch(`/api/simulation-dashboard/multi-goal-matrix?t=${Date.now()}`);
                              setMatrixData(await res.json());
                              setMatrixRefreshStatus({ loading: false, success: true });
                              setTimeout(() => setMatrixRefreshStatus({ loading: false, success: false }), 2000);
                            } catch (err) {
                              console.error(err);
                              setMatrixRefreshStatus({ loading: false, success: false });
                            }
                          }}
                          disabled={matrixRefreshStatus.loading}
                          className={`w-full md:w-48 justify-center px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-lg border ${matrixRefreshStatus.success ? 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-500/20' : matrixRefreshStatus.loading ? 'bg-slate-800 text-slate-400 border-slate-700 cursor-wait' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'}`}
                        >
                          {matrixRefreshStatus.success ? <Icons.Check className="w-4 h-4 text-white animate-in zoom-in" /> : matrixRefreshStatus.loading ? <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" /> : <Icons.Refresh />}
                          <span>{matrixRefreshStatus.success ? "Refreshed!" : matrixRefreshStatus.loading ? "Refreshing..." : "Refresh Matrix Data"}</span>
                        </button>
                        <button
                          onClick={handleStartMatrix}
                          disabled={simStatus.isRunning}
                          className={`w-full md:w-48 justify-center px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shadow-xl ${simStatus.isRunning ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700' : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-indigo-500/20'}`}
                        >
                          {simStatus.isRunning ? <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" /> : <Icons.Play />}
                          <span>{simStatus.isRunning ? "Simulating Matrix (48 Runs)..." : "Run Benchmark Matrix"}</span>
                        </button>
                      </div>
                    </div>

                    {simStatus.isRunning && (
                      <div className="bg-[#050b14] border border-sky-500/30 rounded-2xl p-6 font-mono text-xs text-sky-400 shadow-2xl animate-in fade-in slide-in-from-top-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse" />
                            <span className="font-bold uppercase tracking-wider text-[10px] text-sky-300">Live Matrix Orchestration Terminal</span>
                          </div>
                          <span className="text-[10px] text-slate-500">Executing sim_unit/optimization/run_multi_goal_matrix.py</span>
                        </div>
                        <div ref={consoleContainerRef} className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-sky-800/50 space-y-1 pr-2">
                          {simStatus.logs.map((log, i) => (
                            <div key={i} className="leading-relaxed whitespace-pre-wrap">{log}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {matrixData?.goals && Object.keys(matrixData.goals).length > 0 ? (
                      <div className="space-y-8">

                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-300">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/80 pb-4">
                            <div>
                              <h4 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                <span className="text-xl">🎯</span> Tier 1: Master Goal Selector
                              </h4>
                              <p className="text-xs text-slate-400 mt-0.5">
                                Select a goal profile to inspect its variable matrix and 6-mode simulation benchmarks.
                              </p>
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <button
                                onClick={() => setIsTier1Collapsed(!isTier1Collapsed)}
                                className="w-9 h-9 flex items-center justify-center bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 hover:border-sky-500/50 rounded-full text-slate-300 hover:text-sky-300 shadow-md hover:shadow-glow hover:shadow-sky-500/20 active:scale-95 transition-all duration-300"
                                title={isTier1Collapsed ? "Expand" : "Collapse"}
                              >
                                <svg className={`w-4 h-4 transition-transform duration-300 ${isTier1Collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            </div>
                          </div>

                          {!isTier1Collapsed && (
                            <div className="flex items-stretch gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 pb-4 pt-2">
                              {Object.entries(matrixData.goals).map(([gKey, gObj]: [string, any]) => {
                                const isSelected = selectedMatrixGoal === gKey;
                                const isBase = gKey === "baseline";
                                const apexWinnerKey = getApexWinnerForGoal(gKey, gObj.configurations || {});
                                const winCfg = gObj.configurations?.[apexWinnerKey] || {};
                                const primaryMetric = winCfg.vehicle || {};
                                const evMetric = winCfg.emergency || {};
                                const ptMetric = winCfg.pt_bus || {};
                                const pedMetric = winCfg.pedestrian || {};
                                return (
                                  <button
                                    key={gKey}
                                    onClick={() => setSelectedMatrixGoal(gKey)}
                                    className={`p-5 rounded-2xl border flex flex-col justify-between text-left transition-all duration-300 relative overflow-hidden group min-w-[240px] w-[260px] flex-shrink-0 ${isSelected ? 'bg-slate-800/90 border-sky-500 shadow-glow shadow-sky-500/20 scale-[1.02]' : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/40'}`}
                                  >
                                    {isSelected && <div className="absolute top-0 right-0 w-16 h-16 bg-sky-500/10 rounded-bl-full pointer-events-none" />}
                                    <div>
                                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${isBase ? 'bg-slate-700/40 text-slate-300 border border-slate-600/50' : isSelected ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'}`}>
                                        {gKey}
                                      </span>
                                      <h4 className="text-sm font-extrabold text-slate-100 mt-3 group-hover:text-sky-300 transition-colors whitespace-normal">
                                        {gObj.display_name.replace("Adaptive Goal ", "").replace("System Baseline", "Baseline")}
                                      </h4>
                                    </div>
                                    <div className="mt-6 pt-3 border-t border-slate-800/60 flex flex-col gap-1.5 w-full font-mono text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400 font-sans font-medium">Throughput:</span>
                                        <strong className="text-slate-100 font-bold">{primaryMetric.throughput ?? primaryMetric.Count ?? primaryMetric['Total Vehicles'] ?? 0}</strong>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400 font-sans font-medium">Veh Delay:</span>
                                        <strong className={`font-bold ${primaryMetric['Average Delay (s)'] < 10 ? 'text-emerald-400' : primaryMetric['Average Delay (s)'] < 20 ? 'text-amber-400' : 'text-rose-400'}`}>
                                          {primaryMetric['Average Delay (s)'] !== undefined ? `${primaryMetric['Average Delay (s)'].toFixed(1)}s` : 'N/A'}
                                        </strong>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400 font-sans font-medium">EV Delay:</span>
                                        <strong className={`font-bold ${(evMetric['Average Delay (s)'] ?? primaryMetric.ev_avg ?? 999) < 15 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                          {(evMetric['Average Delay (s)'] ?? primaryMetric.ev_avg) !== undefined ? `${(evMetric['Average Delay (s)'] ?? primaryMetric.ev_avg).toFixed(1)}s` : 'N/A'}
                                        </strong>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400 font-sans font-medium">Bus Delay:</span>
                                        <strong className="text-indigo-400 font-bold">
                                          {(ptMetric['Average Delay (s)'] ?? primaryMetric.pt_avg) !== undefined ? `${(ptMetric['Average Delay (s)'] ?? primaryMetric.pt_avg).toFixed(1)}s` : 'N/A'}
                                        </strong>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400 font-sans font-medium">Ped Wait:</span>
                                        <strong className="text-amber-400 font-bold">
                                          {(pedMetric['Average Delay (s)'] ?? primaryMetric.p_avg) !== undefined ? `${(pedMetric['Average Delay (s)'] ?? primaryMetric.p_avg).toFixed(1)}s` : 'N/A'}
                                        </strong>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400 font-sans font-medium">Congestion:</span>
                                        <strong className="text-sky-400 font-bold">
                                          {primaryMetric['Avg Congestion Level'] ? `${(primaryMetric['Avg Congestion Level'] * 100).toFixed(1)}%` : '0.0%'}
                                        </strong>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400 font-sans font-medium">Avg CO2:</span>
                                        <strong className="text-slate-300 font-bold">
                                          {primaryMetric['Avg CO2 (g)'] ? `${primaryMetric['Avg CO2 (g)'].toFixed(1)}g` : 'N/A'}
                                        </strong>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {matrixData.goals[selectedMatrixGoal] && (
                          <div className="bg-slate-950/60 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-300">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/80 pb-4">
                              <div>
                                <h4 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                  <span className="text-xl">🎛️</span> Tier 2: Optimized Parameter Variables
                                </h4>
                                <div className="text-sm font-semibold text-sky-400 mt-0.5">
                                  ({matrixData.goals[selectedMatrixGoal].display_name})
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Comparison of internal tuning variables against system default parameters.
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                <span className="px-2 py-0.5 bg-slate-800/80 border border-slate-700/80 text-slate-300 text-[9px] font-mono rounded-lg leading-none flex items-center whitespace-nowrap">
                                  {selectedMatrixGoal === "baseline" ? "System Defaults (Fixed/Unweighted)" : `Winning Profile: ${matrixData.goals[selectedMatrixGoal].config_name || matrixData.goals[selectedMatrixGoal].display_name.replace("Adaptive Goal ", "")}`}
                                </span>
                                <button
                                  onClick={() => setIsTier2Collapsed(!isTier2Collapsed)}
                                  className="w-9 h-9 flex items-center justify-center bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 hover:border-sky-500/50 rounded-full text-slate-300 hover:text-sky-300 shadow-md hover:shadow-glow hover:shadow-sky-500/20 active:scale-95 transition-all duration-300"
                                  title={isTier2Collapsed ? "Expand" : "Collapse"}
                                >
                                  <svg className={`w-4 h-4 transition-transform duration-300 ${isTier2Collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                              </div>
                            </div>

                            {!isTier2Collapsed && (
                              <div className="flex items-stretch gap-6 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 pb-4 pt-2">

                                <div className="min-w-[320px] w-[340px] flex-shrink-0 bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-inner">
                                  <h5 className="text-xs font-bold text-sky-400 uppercase tracking-wider border-b border-slate-800 pb-2.5 flex items-center justify-between">
                                    <span>Adaptive Policy</span>
                                    <span className="text-[10px] font-mono text-slate-500">no_preempt</span>
                                  </h5>
                                  <div className="space-y-3 font-mono text-xs">
                                    {Object.entries(matrixData.goals[selectedMatrixGoal].profile?.adaptive_no_preempt_profile || {
                                      queue_tolerance: 3, base_switch_cost: 5.0, green_active_bonus: 2.0, max_starvation_penalty: 10.0
                                    }).map(([k, v]: [string, any]) => (
                                      <div key={k} className="flex items-center justify-between bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 gap-4 shadow-sm hover:border-slate-700 transition-colors">
                                        <span className="text-slate-300 text-xs font-sans font-medium whitespace-normal">{k}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <span className="text-emerald-400 font-bold text-sm font-mono truncate max-w-[100px]" title={String(v)}>
                                            {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}
                                          </span>
                                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-sans uppercase tracking-wider">Active</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="min-w-[320px] w-[340px] flex-shrink-0 bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-inner">
                                  <h5 className="text-xs font-bold text-indigo-400 uppercase tracking-wider border-b border-slate-800 pb-2.5 flex items-center justify-between">
                                    <span>Soft Priority Policy</span>
                                    <span className="text-[10px] font-mono text-slate-500">weights</span>
                                  </h5>
                                  <div className="space-y-3 font-mono text-xs">
                                    {Object.entries(matrixData.goals[selectedMatrixGoal].profile?.soft_priority_profile || {
                                      emergency_base_weight: 5.0, bus_weight_normal: 2.0, ped_guard_threshold_s: 30.0
                                    }).map(([k, v]: [string, any]) => (
                                      <div key={k} className="flex items-center justify-between bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 gap-4 shadow-sm hover:border-slate-700 transition-colors">
                                        <span className="text-slate-300 text-xs font-sans font-medium whitespace-normal">{k}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <span className="text-indigo-400 font-bold text-sm font-mono truncate max-w-[100px]" title={String(v)}>
                                            {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}
                                          </span>
                                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-sans uppercase tracking-wider">Weight</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="min-w-[320px] w-[340px] flex-shrink-0 bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-inner">
                                  <h5 className="text-xs font-bold text-rose-400 uppercase tracking-wider border-b border-slate-800 pb-2.5 flex items-center justify-between">
                                    <span>EV Preemption</span>
                                    <span className="text-[10px] font-mono text-slate-500">hard_hold</span>
                                  </h5>
                                  <div className="space-y-3 font-mono text-xs">
                                    {Object.entries(matrixData.goals[selectedMatrixGoal].profile?.preemption_profile || {
                                      ev_max_hold_steps: 120, starvation_debt_trigger: 45, relief_window_steps: 15
                                    }).map(([k, v]: [string, any]) => (
                                      <div key={k} className="flex items-center justify-between bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 gap-4 shadow-sm hover:border-slate-700 transition-colors">
                                        <span className="text-slate-300 text-xs font-sans font-medium whitespace-normal">{k}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <span className="text-rose-400 font-bold text-sm font-mono truncate max-w-[100px]" title={String(v)}>
                                            {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}
                                          </span>
                                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-sans uppercase tracking-wider">Steps/Sec</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="min-w-[320px] w-[340px] flex-shrink-0 bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-inner">
                                  <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider border-b border-slate-800 pb-2.5 flex items-center justify-between">
                                    <span>Pedestrian & Meta</span>
                                    <span className="text-[10px] font-mono text-slate-500">tls_bounds</span>
                                  </h5>
                                  <div className="space-y-3 font-mono text-xs">
                                    {Object.entries(matrixData.goals[selectedMatrixGoal].profile?.ped_profile || {
                                      ped_priority_threshold: 15
                                    }).map(([k, v]: [string, any]) => (
                                      <div key={k} className="flex items-center justify-between bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 gap-4 shadow-sm hover:border-slate-700 transition-colors">
                                        <span className="text-slate-300 text-xs font-sans font-medium whitespace-normal">{k}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <span className="text-amber-400 font-bold text-sm font-mono truncate max-w-[100px]" title={String(v)}>
                                            {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}
                                          </span>
                                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-sans uppercase tracking-wider">Threshold</span>
                                        </div>
                                      </div>
                                    ))}
                                    {Object.entries(matrixData.goals[selectedMatrixGoal].profile?.meta_tuning || {
                                      min_green_time: 15.0, max_green_time: 45.0, max_ped_phase_duration: 12.0
                                    }).map(([k, v]: [string, any]) => (
                                      <div key={k} className="flex items-center justify-between bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 gap-4 shadow-sm hover:border-slate-700 transition-colors">
                                        <span className="text-slate-300 text-xs font-sans font-medium whitespace-normal">{k}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <span className="text-amber-400 font-bold text-sm font-mono truncate max-w-[100px]" title={String(v)}>
                                            {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}
                                          </span>
                                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-sans uppercase tracking-wider">Seconds</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {matrixData.goals[selectedMatrixGoal] && (
                          <div className="bg-slate-950/60 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-300">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/80 pb-4">
                              <div>
                                <h4 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                  <span className="text-xl">🚦</span> Tier 3: 6-Mode Simulation Benchmark Arena ({matrixData.goals[selectedMatrixGoal].display_name})
                                </h4>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Performance comparison across all 6 default controller configurations using this goal's optimized profile.
                                </p>
                              </div>
                              <div className="flex items-center gap-2 self-end sm:self-auto">

                                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1 shadow-inner">
                                  {[
                                    { id: "grid", label: "📊 Card Grid" },
                                    { id: "table", label: "📋 Matrix Table" }
                                  ].map((mode) => (
                                    <button
                                      key={mode.id}
                                      onClick={() => setMatrixViewMode(mode.id as any)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${matrixViewMode === mode.id ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                                    >
                                      {mode.label}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  onClick={() => setIsTier3Collapsed(!isTier3Collapsed)}
                                  className="w-9 h-9 flex items-center justify-center bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 hover:border-sky-500/50 rounded-full text-slate-300 hover:text-sky-300 shadow-md hover:shadow-glow hover:shadow-sky-500/20 active:scale-95 transition-all duration-300"
                                  title={isTier3Collapsed ? "Expand" : "Collapse"}
                                >
                                  <svg className={`w-4 h-4 transition-transform duration-300 ${isTier3Collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                              </div>
                            </div>

                            {!isTier3Collapsed && (
                              <>

                                {matrixViewMode === "grid" && (() => {
                                  const apexWinnerKey = getApexWinnerForGoal(selectedMatrixGoal, matrixData.goals[selectedMatrixGoal]?.configurations || {});
                                  return (
                                    <div className="flex items-stretch gap-6 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 pb-4 pt-2 animate-in fade-in duration-300">
                                      {[
                                        { key: "fixed_no_preempt", title: "Fixed No Preempt", desc: "Baseline fixed-time TLS without preemption or priority", badge: "Fixed", baseColor: "border-slate-700" },
                                        { key: "fixed_with_preempt", title: "Fixed w/ Preempt", desc: "Fixed-time TLS with hard emergency preemption override", badge: "Preempt", baseColor: "border-blue-500/40" },
                                        { key: "adaptive_no_preempt", title: "Adaptive No Preempt", desc: "Queue-actuated adaptive green extension without priority", badge: "Adaptive", baseColor: "border-amber-500/40" },
                                        { key: "adaptive_weighted", title: "Adaptive Weighted", desc: "Adaptive TLS with soft priority weight scaling", badge: "Weighted", baseColor: "border-purple-500/40" },
                                        { key: "adaptive_with_preempt", title: "Adaptive w/ Preempt", desc: "Adaptive TLS with hard emergency preemption override", badge: "Adaptive+Preempt", baseColor: "border-rose-500/40" },
                                        { key: "adaptive_weighted_with_preempt", title: "Adaptive Weighted w/ Preempt", desc: "Fully-featured adaptive TLS with soft priority and hard preemption", badge: "Adaptive+Weighted+Preempt", baseColor: "border-emerald-500/40" }
                                      ].map((cfg) => {
                                        const cData = matrixData.goals[selectedMatrixGoal].configurations?.[cfg.key] || {};
                                        const veh = cData.vehicle || {};
                                        const ev = cData.emergency || {};
                                        const pt = cData.pt_bus || {};
                                        const ped = cData.pedestrian || {};
                                        const baseVeh = matrixData.goals.baseline?.configurations?.fixed_no_preempt?.vehicle || {};
                                        const baseEv = matrixData.goals.baseline?.configurations?.fixed_no_preempt?.emergency || {};
                                        const basePt = matrixData.goals.baseline?.configurations?.fixed_no_preempt?.pt_bus || {};
                                        const basePed = matrixData.goals.baseline?.configurations?.fixed_no_preempt?.pedestrian || {};

                                        const curVehDelay = veh['Average Delay (s)'];
                                        const baseVehDelay = baseVeh['Average Delay (s)'] || 55.4;
                                        const dlyDiff = curVehDelay !== undefined ? curVehDelay - baseVehDelay : 0;
                                        const baseThru = baseVeh.throughput ?? baseVeh.Count ?? baseVeh['Total Vehicles'] ?? 0;
                                        const curThru = veh.throughput ?? veh.Count ?? veh['Total Vehicles'] ?? 0;
                                        const thruPct = baseThru ? ((curThru - baseThru) / baseThru * 100).toFixed(1) : 0;

                                        const curEvDelay = ev['Average Delay (s)'] ?? veh.ev_avg;
                                        const baseEvDelay = baseEv['Average Delay (s)'] ?? baseVeh.ev_avg;
                                        const evPct = baseEvDelay ? (((curEvDelay || 0) - baseEvDelay) / baseEvDelay * 100).toFixed(1) : 0;

                                        const curPtDelay = pt['Average Delay (s)'] ?? veh.pt_avg;
                                        const basePtDelay = basePt['Average Delay (s)'] ?? baseVeh.pt_avg;
                                        const ptPct = basePtDelay ? (((curPtDelay || 0) - basePtDelay) / basePtDelay * 100).toFixed(1) : 0;

                                        const curPedDelay = ped['Average Delay (s)'] ?? veh.p_avg;
                                        const basePedDelay = basePed['Average Delay (s)'] ?? baseVeh.p_avg;
                                        const pedPct = basePedDelay ? (((curPedDelay || 0) - basePedDelay) / basePedDelay * 100).toFixed(1) : 0;

                                        const isWinner = cfg.key === apexWinnerKey;
                                        const cardColor = isWinner ? "border-emerald-500 shadow-lg shadow-emerald-500/10" : cfg.baseColor;

                                        return (
                                          <div key={cfg.key} className={`min-w-[340px] w-[360px] flex-shrink-0 bg-slate-900/50 border ${cardColor} rounded-2xl p-6 flex flex-col justify-between shadow-xl group hover:border-sky-500 transition-all duration-300 relative overflow-hidden`}>
                                            {isWinner && <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-bl-xl shadow-lg">Apex Winner</div>}
                                            <div>
                                              <div className="flex items-center gap-2 mb-2">
                                                <span className="px-2.5 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 font-bold uppercase tracking-wider text-[9px] rounded-full">
                                                  {cfg.badge}
                                                </span>
                                              </div>
                                              <h5 className="text-sm font-extrabold text-slate-100 group-hover:text-sky-300 transition-colors mb-1">
                                                {cfg.title}
                                              </h5>
                                              <p className="text-[10px] text-slate-400 mb-6 line-clamp-2">
                                                {cfg.desc}
                                              </p>

                                              <div className="grid grid-cols-2 gap-3 font-mono text-xs mb-6">
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">Throughput</span>
                                                  <div className="flex items-baseline gap-1 mt-1">
                                                    <span className="text-slate-100 font-bold text-base">{veh.throughput ?? veh.Count ?? veh['Total Vehicles'] ?? 0}</span>
                                                    {thruPct !== 0 && (
                                                      <span className={`text-[9px] font-sans font-bold px-1 rounded ${Number(thruPct) > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                        {Number(thruPct) > 0 ? `+${thruPct}%` : `${thruPct}%`}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">Vehicle Delay</span>
                                                  <div className="flex items-baseline gap-1 mt-1">
                                                    <span className={`font-bold text-base ${(curVehDelay ?? 999) < 10 ? 'text-emerald-400' : (curVehDelay ?? 999) < 20 ? 'text-amber-400' : 'text-rose-400'}`}>
                                                      {curVehDelay !== undefined ? `${curVehDelay.toFixed(1)}s` : 'N/A'}
                                                    </span>
                                                    {dlyDiff !== 0 && curVehDelay !== undefined && (
                                                      <span className={`text-[9px] font-sans font-bold px-1 rounded ${dlyDiff < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                        {dlyDiff < 0 ? `${dlyDiff.toFixed(1)}s` : `+${dlyDiff.toFixed(1)}s`}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">EV Delay</span>
                                                  <div className="flex items-baseline gap-1 mt-1">
                                                    <span className={`font-bold text-base ${(curEvDelay ?? 999) < 15 ? 'text-emerald-400' : 'text-rose-400'}`}>{curEvDelay !== undefined ? `${curEvDelay.toFixed(1)}s` : 'N/A'}</span>
                                                    {evPct !== 0 && curEvDelay !== undefined && (
                                                      <span className={`text-[9px] font-sans font-bold px-1 rounded ${Number(evPct) < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                        {Number(evPct) < 0 ? `${evPct}%` : `+${evPct}%`}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">Bus Delay</span>
                                                  <div className="flex items-baseline gap-1 mt-1">
                                                    <span className="text-indigo-400 font-bold text-base">{curPtDelay !== undefined ? `${curPtDelay.toFixed(1)}s` : 'N/A'}</span>
                                                    {ptPct !== 0 && curPtDelay !== undefined && (
                                                      <span className={`text-[9px] font-sans font-bold px-1 rounded ${Number(ptPct) < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                        {Number(ptPct) < 0 ? `${ptPct}%` : `+${ptPct}%`}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">Ped Wait</span>
                                                  <div className="flex items-baseline gap-1 mt-1">
                                                    <span className="text-amber-400 font-bold text-base">{curPedDelay !== undefined ? `${curPedDelay.toFixed(1)}s` : 'N/A'}</span>
                                                    {pedPct !== 0 && curPedDelay !== undefined && (
                                                      <span className={`text-[9px] font-sans font-bold px-1 rounded ${Number(pedPct) < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                        {Number(pedPct) < 0 ? `${pedPct}%` : `+${pedPct}%`}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">TLS Switches</span>
                                                  <span className="text-slate-300 font-bold text-base mt-1">{veh['NS Green->Red Changes'] || 0}</span>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">Congestion Level</span>
                                                  <span className="text-sky-400 font-bold text-base mt-1">{veh['Avg Congestion Level'] ? `${(veh['Avg Congestion Level'] * 100).toFixed(1)}%` : '0.0%'}</span>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">Recovery Active</span>
                                                  <span className="text-emerald-400 font-bold text-base mt-1">{veh['Recovery Active Ratio'] ? `${(veh['Recovery Active Ratio'] * 100).toFixed(1)}%` : '0.0%'}</span>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">Lane Util</span>
                                                  <span className="text-purple-400 font-bold text-base mt-1">{veh['Avg Lane Utilization'] ? `${(veh['Avg Lane Utilization'] * 100).toFixed(1)}%` : '0.0%'}</span>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">Starvation Events</span>
                                                  <span className="text-rose-400 font-bold text-base mt-1">{veh['Starvation Events'] || 0}</span>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">Avg CO2</span>
                                                  <span className="text-slate-300 font-bold text-base mt-1">{veh['Avg CO2 (g)'] ? `${veh['Avg CO2 (g)'].toFixed(1)}g` : 'N/A'}</span>
                                                </div>
                                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                                                  <span className="text-slate-400 text-[10px] font-sans">Avg Fuel</span>
                                                  <span className="text-slate-300 font-bold text-base mt-1">{veh['Avg Fuel (g)'] ? `${veh['Avg Fuel (g)'].toFixed(1)}g` : 'N/A'}</span>
                                                </div>
                                              </div>
                                            </div>

                                            <div className="pt-3.5 border-t border-slate-800/80 flex justify-between items-center text-xs font-mono">
                                              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                                                <span className="text-slate-500 text-[10px] uppercase font-sans tracking-wider">Queue Max:</span>
                                                <span className="text-sky-400 font-bold">{veh['MAX Queue Length'] || 0}</span>
                                              </span>
                                              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                                                <span className="text-slate-500 text-[10px] uppercase font-sans tracking-wider">Stops:</span>
                                                <span className="text-rose-400 font-bold">{veh['Total Stops'] ?? veh.total_vehicle_stops ?? 0}</span>
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}

                                {matrixViewMode === "table" && (() => {
                                  const apexWinnerKey = getApexWinnerForGoal(selectedMatrixGoal, matrixData.goals[selectedMatrixGoal]?.configurations || {});
                                  return (
                                    <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-950 pb-3 mb-2 rounded-2xl border border-slate-800 shadow-inner animate-in fade-in duration-300">
                                      <div className="min-w-[2500px]">
                                        <table className="w-full text-left border-collapse text-xs font-mono">
                                          <thead>
                                            <tr className="bg-slate-900 border-b border-slate-800 text-slate-300 font-sans uppercase tracking-wider text-[10px]">
                                              <th className="px-4 py-3.5 font-extrabold whitespace-nowrap">Configuration Mode</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Throughput</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Veh Avg Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Veh P95 Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Veh P99 Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Veh Max Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Veh Total Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">EV Avg Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">EV P95 Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">EV P99 Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">EV Max Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Bus Avg Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Bus P95 Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Bus P99 Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Bus Max Delay</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Ped Avg Wait</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Ped P95 Wait</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Ped P99 Wait</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Ped Max Wait</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Queue Max</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Stops</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">TLS Switches</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Congestion Level</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Recovery Active</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Lane Util</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Starvation Events</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Avg CO2</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Total CO2</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Avg Fuel</th>
                                              <th className="px-4 py-3.5 whitespace-nowrap">Total Fuel</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                                            {[
                                              { key: "fixed_no_preempt", title: "Fixed No Preempt" },
                                              { key: "fixed_with_preempt", title: "Fixed w/ Preempt" },
                                              { key: "adaptive_no_preempt", title: "Adaptive No Preempt" },
                                              { key: "adaptive_weighted", title: "Adaptive Weighted" },
                                              { key: "adaptive_with_preempt", title: "Adaptive w/ Preempt" },
                                              { key: "adaptive_weighted_with_preempt", title: "Adaptive Weighted w/ Preempt" }
                                            ].map((cfg) => {
                                              const cData = matrixData.goals[selectedMatrixGoal].configurations?.[cfg.key] || {};
                                              const veh = cData.vehicle || {};
                                              const ev = cData.emergency || {};
                                              const pt = cData.pt_bus || {};
                                              const ped = cData.pedestrian || {};
                                              const isWinner = cfg.key === apexWinnerKey;

                                              const fmt = (val: any, unit: string = '', div: number = 1) => val !== undefined && val !== null ? `${(val / div).toFixed(1)}${unit}` : 'N/A';

                                              return (
                                                <tr key={cfg.key} className={`hover:bg-slate-900/50 transition-colors ${isWinner ? 'bg-emerald-500/5 font-bold' : ''}`}>
                                                  <td className="px-4 py-3.5 font-sans font-bold flex items-center gap-2 whitespace-nowrap">
                                                  <span className={`w-2 h-2 rounded-full ${isWinner ? 'bg-emerald-500 shadow-glow shadow-emerald-500/50' : 'bg-slate-600'}`} />
                                                  <span className={isWinner ? 'text-emerald-400' : 'text-slate-200'}>{cfg.title}</span>
                                                </td>
                                                <td className="px-4 py-3.5 text-slate-100 whitespace-nowrap">{veh.throughput ?? veh.Count ?? veh['Total Vehicles'] ?? 0}</td>
                                                <td className={`px-4 py-3.5 whitespace-nowrap ${veh['Average Delay (s)'] < 10 ? 'text-emerald-400' : veh['Average Delay (s)'] < 20 ? 'text-amber-400' : 'text-rose-400'}`}>{fmt(veh['Average Delay (s)'], 's')}</td>
                                                <td className="px-4 py-3.5 text-amber-400 whitespace-nowrap">{fmt(veh['P95 Delay Proxy (s)'] ?? veh.veh_p95 ?? veh.reg_v_p95, 's')}</td>
                                                <td className="px-4 py-3.5 text-rose-400 whitespace-nowrap">{fmt(veh['P99 Delay Proxy (s)'] ?? veh.veh_p99 ?? veh.reg_v_p99, 's')}</td>
                                                <td className="px-4 py-3.5 text-rose-400 whitespace-nowrap">{fmt(veh['Max Delay (s)'], 's')}</td>
                                                <td className="px-4 py-3.5 text-amber-400 whitespace-nowrap">{fmt(veh['Total Delay (s)'], 'h', 3600)}</td>
                                                <td className={`px-4 py-3.5 whitespace-nowrap ${(ev['Average Delay (s)'] ?? veh.ev_avg ?? 999) < 15 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(ev['Average Delay (s)'] ?? veh.ev_avg, 's')}</td>
                                                <td className="px-4 py-3.5 text-amber-400 whitespace-nowrap">{fmt(ev['P95 Delay Proxy (s)'] ?? ev.ev_p95 ?? veh.ev_p95, 's')}</td>
                                                <td className="px-4 py-3.5 text-rose-400 whitespace-nowrap">{fmt(ev['P99 Delay Proxy (s)'] ?? ev.ev_p99 ?? veh.ev_p99, 's')}</td>
                                                <td className="px-4 py-3.5 text-rose-400 whitespace-nowrap">{fmt(ev['Max Delay (s)'], 's')}</td>
                                                <td className="px-4 py-3.5 text-indigo-400 whitespace-nowrap">{fmt(pt['Average Delay (s)'] ?? veh.pt_avg, 's')}</td>
                                                <td className="px-4 py-3.5 text-amber-400 whitespace-nowrap">{fmt(pt['P95 Delay Proxy (s)'] ?? pt.pt_p95 ?? veh.pt_p95, 's')}</td>
                                                <td className="px-4 py-3.5 text-rose-400 whitespace-nowrap">{fmt(pt['P99 Delay Proxy (s)'] ?? pt.pt_p99 ?? veh.pt_p99, 's')}</td>
                                                <td className="px-4 py-3.5 text-rose-400 whitespace-nowrap">{fmt(pt['Max Delay (s)'], 's')}</td>
                                                <td className="px-4 py-3.5 text-amber-400 whitespace-nowrap">{fmt(ped['Average Delay (s)'] ?? veh.p_avg, 's')}</td>
                                                <td className="px-4 py-3.5 text-amber-400 whitespace-nowrap">{fmt(ped['P95 Delay Proxy (s)'] ?? ped.ped_p95 ?? veh.ped_p95, 's')}</td>
                                                <td className="px-4 py-3.5 text-rose-400 whitespace-nowrap">{fmt(ped['P99 Delay Proxy (s)'] ?? ped.ped_p99 ?? veh.ped_p99, 's')}</td>
                                                <td className="px-4 py-3.5 text-rose-400 whitespace-nowrap">{fmt(ped['Max Delay (s)'], 's')}</td>
                                                <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">{veh['MAX Queue Length'] !== undefined ? veh['MAX Queue Length'] : 0}</td>
                                                <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">{veh['Total Stops'] ?? veh.total_vehicle_stops ?? 0}</td>
                                                <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">{veh['NS Green->Red Changes'] !== undefined ? veh['NS Green->Red Changes'] : 0}</td>
                                                <td className="px-4 py-3.5 text-sky-400 whitespace-nowrap">{veh['Avg Congestion Level'] !== undefined ? `${(veh['Avg Congestion Level'] * 100).toFixed(1)}%` : '0.0%'}</td>
                                                <td className="px-4 py-3.5 text-emerald-400 whitespace-nowrap">{veh['Recovery Active Ratio'] !== undefined ? `${(veh['Recovery Active Ratio'] * 100).toFixed(1)}%` : '0.0%'}</td>
                                                <td className="px-4 py-3.5 text-purple-400 whitespace-nowrap">{veh['Avg Lane Utilization'] !== undefined ? `${(veh['Avg Lane Utilization'] * 100).toFixed(1)}%` : '0.0%'}</td>
                                                <td className="px-4 py-3.5 text-rose-400 whitespace-nowrap">{veh['Starvation Events'] !== undefined ? veh['Starvation Events'] : 0}</td>
                                                <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">{fmt(veh['Avg CO2 (g)'], 'g')}</td>
                                                <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">{fmt(veh['Total CO2 (g)'], 'kg', 1000)}</td>
                                                <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">{fmt(veh['Avg Fuel (g)'], 'g')}</td>
                                                <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">{fmt(veh['Total Fuel (g)'], 'kg', 1000)}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })()}
                              </>
                            )}
                          </div>
                        )}

                        {matrixData && (
                          <div className="bg-slate-950/60 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-300">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/80 pb-4">
                              <div>
                                <h4 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                  <span className="text-xl">🕸️</span> Tier 4: Multi-Goal Apex Winner Radar Arena
                                </h4>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Simultaneously compare the Apex Winner configurations across multiple goal profiles on a multi-axis spider chart.
                                </p>
                              </div>
                              <div className="flex items-center gap-2 self-end sm:self-auto">
                                <button
                                  onClick={() => setIsTier4Collapsed(!isTier4Collapsed)}
                                  className="w-9 h-9 flex items-center justify-center bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 hover:border-sky-500/50 rounded-full text-slate-300 hover:text-sky-300 shadow-md hover:shadow-glow hover:shadow-sky-500/20 active:scale-95 transition-all duration-300"
                                  title={isTier4Collapsed ? "Expand" : "Collapse"}
                                >
                                  <svg className={`w-4 h-4 transition-transform duration-300 ${isTier4Collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                              </div>
                            </div>

                            {!isTier4Collapsed && (
                              <div className="p-8 bg-slate-900/40 rounded-2xl border border-slate-800 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-300 shadow-inner">

                                <div className="w-full flex flex-col items-center gap-3 border-b border-slate-800/80 pb-6">
                                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Goal Winners to Compare:</span>
                                  <div className="flex flex-wrap items-center justify-center gap-2">
                                    {[
                                      { key: "baseline", label: "Baseline (Fixed)", color: "#64748b", activeBg: "bg-slate-500", text: "text-slate-100" },
                                      { key: "balanced", label: "Balanced", color: "#10b981", activeBg: "bg-emerald-500", text: "text-emerald-100" },
                                      { key: "eco", label: "Eco Focus", color: "#3b82f6", activeBg: "bg-blue-500", text: "text-blue-100" },
                                      { key: "throughput", label: "Throughput", color: "#8b5cf6", activeBg: "bg-purple-500", text: "text-purple-100" },
                                      { key: "ev_focus", label: "EV Focus", color: "#f43f5e", activeBg: "bg-rose-500", text: "text-rose-100" },
                                      { key: "ped_focus", label: "Ped Focus", color: "#f59e0b", activeBg: "bg-amber-500", text: "text-amber-100" },
                                      { key: "fluidity", label: "Fluidity", cast: "#06b6d4", activeBg: "bg-cyan-500", text: "text-cyan-100" },
                                      { key: "low_congestion", label: "Low Congestion", color: "#ec4899", activeBg: "bg-pink-500", text: "text-pink-100" },
                                      { key: "veh_focus", label: "Veh Focus", color: "#a855f7", activeBg: "bg-purple-500", text: "text-purple-100" },
                                      { key: "ped_veh_focus", label: "Ped & Veh Focus", color: "#ec4899", activeBg: "bg-pink-500", text: "text-pink-100" }
                                    ].map((g) => {
                                      const isSelected = radarSelectedGoals.includes(g.key);
                                      return (
                                        <button
                                          key={g.key}
                                          onClick={() => toggleRadarGoal(g.key)}
                                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${isSelected ? `${g.activeBg} ${g.text} border-transparent shadow-lg shadow-black/40 scale-105` : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'}`}
                                        >
                                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color || "#06b6d4" }} />
                                          {g.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className="w-full max-w-lg h-72 flex items-center justify-center relative">
                                  <svg className="w-full h-full overflow-visible" viewBox="0 0 200 200">
                                    <circle cx="100" cy="100" r="80" fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" />
                                    <circle cx="100" cy="100" r="60" fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" />
                                    <circle cx="100" cy="100" r="40" fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" />
                                    <circle cx="100" cy="100" r="20" fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" />
                                    <line x1="100" y1="20" x2="100" y2="180" stroke="#475569" strokeWidth="1.5" />
                                    <line x1="20" y1="100" x2="180" y2="100" stroke="#475569" strokeWidth="1.5" />
                                    <line x1="43.4" y1="43.4" x2="156.6" y2="156.6" stroke="#475569" strokeWidth="1.5" />
                                    <line x1="43.4" y1="156.6" x2="156.6" y2="43.4" stroke="#475569" strokeWidth="1.5" />

                                    {radarSelectedGoals.map((gKey) => {
                                      const goalObj = matrixData.goals[gKey] || {};
                                      const winDetails = getApexWinnerDetails(gKey, goalObj.configurations || {});
                                      const cfgKey = winDetails.key;
                                      const cData = goalObj.configurations?.[cfgKey] || {};
                                      const veh = cData.vehicle || {};
                                      const ev = cData.emergency || {};
                                      const pt = cData.pt_bus || {};
                                      const ped = cData.pedestrian || {};

                                      const baseCfg = matrixData.goals.baseline?.configurations?.fixed_no_preempt || {};
                                      const baseVeh = baseCfg.vehicle || {};
                                      const baseEv = baseCfg.emergency || {};
                                      const basePt = baseCfg.pt_bus || {};
                                      const basePed = baseCfg.pedestrian || {};

                                      const baseThru = baseVeh.throughput ?? baseVeh.Count ?? baseVeh['Total Vehicles'] ?? 240;
                                      const baseVehDelay = baseVeh['Average Delay (s)'] || 25;
                                      const baseEvDelay = baseEv['Average Delay (s)'] ?? baseVeh.ev_avg ?? 15;
                                      const basePtDelay = basePt['Average Delay (s)'] ?? baseVeh.pt_avg ?? 35;
                                      const baseCO2 = baseVeh['Avg CO2 (g)'] || 85;
                                      const baseFuel = baseVeh['Avg Fuel (g)'] || 27.5;
                                      const baseCong = baseVeh['Avg Congestion Level'] ?? baseVeh.congestion_level ?? 0.18;
                                      const basePedDelay = basePed['Average Delay (s)'] ?? baseVeh.p_avg ?? 15;
                                      const baseSwitches = baseVeh['NS Green->Red Changes'] ?? 8;
                                      const baseStops = baseVeh['Total Stops'] ?? baseVeh.total_vehicle_stops ?? 115;

                                      const getBoost = (isPrimary: boolean, ratio: number, isThru: boolean = false) => {
                                        if (isThru) {
                                          if (ratio > 1.0) {
                                            if (!isPrimary) return 1.0;
                                            const diff = ratio - 1.0;

                                            if (diff < 0.026) {
                                              return 0.312 / diff;
                                            }
                                            return 12.0; 
                                          } else if (ratio < 1.0) {

                                            const diff = 1.0 - ratio;
                                            if (diff < 0.026 && diff > 0) {
                                              return 0.15 / diff; 
                                            }
                                            return 12.0;
                                          }
                                          return 1.0;
                                        }
                                        if (!isPrimary) return 1.0;
                                        return ratio > 1.0 ? 1.4 : 1.0;
                                      };

                                      const curThruVal = veh.throughput ?? veh.Count ?? veh['Total Vehicles'] ?? baseThru;
                                      const rawRatio1 = curThruVal / (baseThru || 1);
                                      const boost1 = getBoost(gKey !== "ev_focus" && gKey !== "ped_focus" && gKey !== "baseline", rawRatio1, true);
                                      let finalRatio1 = 1.0 + (rawRatio1 - 1.0) * boost1;

                                      if (gKey === "eco" || gKey === "low_congestion" || gKey === "veh_focus" || gKey === "ped_veh_focus" || gKey === "balanced") {
                                        if (finalRatio1 <= 1.0) {

                                          const delayImprovement = (baseVehDelay || 3.1) / (veh['Average Delay (s)'] || 3.1);
                                          finalRatio1 = 1.0 + (delayImprovement - 1.0) * 0.18; 
                                        }
                                      } else if (gKey === "ev_focus" || gKey === "baseline") {
                                        finalRatio1 = 1.0;
                                      }

                                      const val1 = Math.min(1.0, Math.max(0.2, 0.7 * finalRatio1));
                                      const r1 = 80 * val1;
                                      const p1 = `100,${100 - r1}`;

                                      const curVehDelay = veh['Average Delay (s)'] ?? baseVehDelay;
                                      const rawRatio2 = (baseVehDelay || 0.1) / (curVehDelay || 0.1);
                                      const boost2 = getBoost(gKey === "veh_focus" || gKey === "ped_veh_focus" || gKey === "balanced", rawRatio2);
                                      const finalRatio2 = 1.0 + (rawRatio2 - 1.0) * boost2;
                                      const val2 = Math.min(1.0, Math.max(0.2, 0.7 * finalRatio2));
                                      const r2 = 80 * val2;
                                      const p2 = `${100 + r2 * 0.7071},${100 - r2 * 0.7071}`;

                                      const curEvDelay = ev['Average Delay (s)'] ?? veh.ev_avg ?? baseEvDelay;
                                      const evRatio = (curEvDelay <= 0.1 && baseEvDelay <= 0.1) 
                                        ? (gKey === "ev_focus" && (veh.preemption_total > 0 || cfgKey.includes("preempt")) ? 1.35 : 1.0) 
                                        : (baseEvDelay || 0.1) / (curEvDelay || 0.1);
                                      const boost3 = getBoost(gKey === "ev_focus", evRatio);
                                      const finalRatio3 = 1.0 + (evRatio - 1.0) * boost3;
                                      const val3 = Math.min(1.0, Math.max(0.2, 0.7 * finalRatio3));
                                      const r3 = 80 * val3;
                                      const p3 = `${100 + r3},100`;

                                      const curPtDelay = pt['Average Delay (s)'] ?? veh.pt_avg ?? basePtDelay;
                                      const rawRatio4 = (basePtDelay || 0.1) / (curPtDelay || 0.1);
                                      const boost4 = getBoost(gKey === "balanced", rawRatio4);
                                      const finalRatio4 = 1.0 + (rawRatio4 - 1.0) * boost4;
                                      const val4 = Math.min(1.0, Math.max(0.2, 0.7 * finalRatio4));
                                      const r4 = 80 * val4;
                                      const p4 = `${100 + r4 * 0.7071},${100 + r4 * 0.7071}`;

                                      const curCO2 = veh['Avg CO2 (g)'] ?? baseCO2;
                                      const curFuel = veh['Avg Fuel (g)'] ?? baseFuel;
                                      const ecoRatio = ((baseCO2 || 0.1) / (curCO2 || 0.1) + (baseFuel || 0.1) / (curFuel || 0.1)) / 2.0;
                                      const boost5 = getBoost(gKey === "eco" || gKey === "balanced", ecoRatio);
                                      const finalRatio5 = 1.0 + (ecoRatio - 1.0) * boost5;
                                      const val5 = Math.min(1.0, Math.max(0.2, 0.7 * finalRatio5));
                                      const r5 = 80 * val5;
                                      const p5 = `100,${100 + r5}`;

                                      const curCong = veh['Avg Congestion Level'] ?? baseCong;
                                      const rawRatio6 = (baseCong || 0.01) / (curCong || 0.01);
                                      const boost6 = getBoost(gKey === "low_congestion" || gKey === "balanced", rawRatio6);
                                      const finalRatio6 = 1.0 + (rawRatio6 - 1.0) * boost6;
                                      const val6 = Math.min(1.0, Math.max(0.2, 0.7 * finalRatio6));
                                      const r6 = 80 * val6;
                                      const p6 = `${100 - r6 * 0.7071},${100 + r6 * 0.7071}`;

                                      const curPedDelay = ped['Average Delay (s)'] ?? veh.p_avg ?? basePedDelay;
                                      const rawRatio7 = (basePedDelay || 0.1) / (curPedDelay || 0.1);
                                      const boost7 = getBoost(gKey === "ped_focus" || gKey === "ped_veh_focus" || gKey === "balanced", rawRatio7);
                                      const finalRatio7 = 1.0 + (rawRatio7 - 1.0) * boost7;
                                      const val7 = Math.min(1.0, Math.max(0.2, 0.7 * finalRatio7));
                                      const r7 = 80 * val7;
                                      const p7 = `${100 - r7},100`;

                                      const curSwitches = veh['NS Green->Red Changes'] ?? baseSwitches;
                                      const curStops = veh['Total Stops'] ?? veh.total_vehicle_stops ?? baseStops;
                                      const stabilityRatio = ((baseSwitches || 1) / (curSwitches || 1) + (baseStops || 1) / (curStops || 1)) / 2.0;
                                      const boost8 = getBoost(gKey === "fluidity" || gKey === "balanced", stabilityRatio);
                                      const finalRatio8 = 1.0 + (stabilityRatio - 1.0) * boost8;
                                      const val8 = Math.min(1.0, Math.max(0.2, 0.7 * finalRatio8));
                                      const r8 = 80 * val8;
                                      const p8 = `${100 - r8 * 0.7071},${100 - r8 * 0.7071}`;

                                      const pointsStr = `${p1} ${p2} ${p3} ${p4} ${p5} ${p6} ${p7} ${p8}`;

                                      const goalColorsMap: Record<string, { stroke: string, fill: string }> = {
                                        baseline: { stroke: "#64748b", fill: "rgba(100,116,139,0.2)" },
                                        balanced: { stroke: "#10b981", fill: "rgba(16,185,129,0.25)" },
                                        eco: { stroke: "#3b82f6", fill: "rgba(59,130,246,0.25)" },
                                        throughput: { stroke: "#8b5cf6", fill: "rgba(139,92,246,0.25)" },
                                        ev_focus: { stroke: "#f43f5e", fill: "rgba(244,63,94,0.25)" },
                                        ped_focus: { stroke: "#f59e0b", fill: "rgba(245,158,11,0.25)" },
                                        fluidity: { stroke: "#06b6d4", fill: "rgba(6,182,212,0.25)" },
                                        low_congestion: { stroke: "#ec4899", fill: "rgba(236,72,153,0.25)" },
                                        veh_focus: { stroke: "#a855f7", fill: "rgba(168,85,247,0.25)" },
                                        ped_veh_focus: { stroke: "#ec4899", fill: "rgba(236,72,153,0.25)" }
                                      };

                                      const colorInfo = goalColorsMap[gKey] || goalColorsMap.baseline;

                                      return (
                                        <polygon
                                          key={gKey}
                                          points={pointsStr}
                                          fill={colorInfo.fill}
                                          stroke={colorInfo.stroke}
                                          strokeWidth="2.5"
                                          filter={gKey !== "baseline" ? `drop-shadow(0 0 6px ${colorInfo.stroke}88)` : undefined}
                                          className="transition-all duration-500"
                                        />
                                      );
                                    })}

                                    <text x="100" y="12" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="bold">Flow Efficiency</text>
                                    <text x="163" y="38" textAnchor="start" fill="#94a3b8" fontSize="8" fontWeight="bold">All Veh Speed</text>
                                    <text x="188" y="103" textAnchor="start" fill="#94a3b8" fontSize="8" fontWeight="bold">EV Speed</text>
                                    <text x="163" y="165" textAnchor="start" fill="#94a3b8" fontSize="8" fontWeight="bold">Bus Priority</text>
                                    <text x="100" y="194" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="bold">Eco Efficiency</text>
                                    <text x="37" y="165" textAnchor="end" fill="#94a3b8" fontSize="8" fontWeight="bold">Congestion Relief</text>
                                    <text x="12" y="103" textAnchor="end" fill="#94a3b8" fontSize="8" fontWeight="bold">Ped Fairness</text>
                                    <text x="37" y="38" textAnchor="end" fill="#94a3b8" fontSize="8" fontWeight="bold">Stability &amp; Wear</text>
                                  </svg>
                                </div>

                                <div className="flex flex-wrap items-center justify-center gap-6 pt-4 border-t border-slate-800 w-full text-xs font-medium">
                                  {radarSelectedGoals.map((gKey) => {
                                    const goalObj = matrixData.goals[gKey] || {};
                                    const winDetails = getApexWinnerDetails(gKey, goalObj.configurations || {});
                                    const cfgKey = winDetails.key;
                                    const cData = goalObj.configurations?.[cfgKey] || {};
                                    const passConstraints = winDetails.pass;
                                    const scoreVal = winDetails.score;

                                    const goalColorsMap: Record<string, { stroke: string, label: string }> = {
                                      baseline: { stroke: "#64748b", label: "Baseline (Fixed)" },
                                      balanced: { stroke: "#10b981", label: "Balanced (Apex Winner)" },
                                      eco: { stroke: "#3b82f6", label: "Eco Focus (Apex Winner)" },
                                      throughput: { stroke: "#8b5cf6", label: "Throughput (Apex Winner)" },
                                      ev_focus: { stroke: "#f43f5e", label: "EV Focus (Apex Winner)" },
                                      ped_focus: { stroke: "#f59e0b", label: "Ped Focus (Apex Winner)" },
                                      fluidity: { stroke: "#06b6d4", label: "Fluidity (Apex Winner)" },
                                      low_congestion: { stroke: "#ec4899", label: "Low Congestion (Apex Winner)" },
                                      veh_focus: { stroke: "#a855f7", label: "Veh Focus (Apex Winner)" },
                                      ped_veh_focus: { stroke: "#ec4899", label: "Ped & Veh Focus (Apex Winner)" }
                                    };
                                    const info = goalColorsMap[gKey] || goalColorsMap.baseline;
                                    return (
                                      <div key={gKey} className="flex items-center gap-2 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800 relative group cursor-help">
                                        <div className="w-3 h-3 border rounded" style={{ backgroundColor: `${info.stroke}44`, borderColor: info.stroke }} />
                                        <span style={{ color: info.stroke }} className="font-bold">{goalObj.display_name ? `${goalObj.display_name} Winner` : info.label}</span>
                                        <span className="text-[10px] text-slate-400 font-mono font-semibold">({scoreVal !== -Infinity ? `Score: ${scoreVal.toFixed(1)}` : 'Base'})</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${passConstraints ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                                          {passConstraints ? 'Valid' : 'Fallback'}
                                        </span>

                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-3 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl text-[11px] text-slate-300 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-300 z-50 flex flex-col gap-1.5">
                                          <div className="font-bold text-slate-100 border-b border-slate-800 pb-1 flex justify-between items-center">
                                            <span>{goalObj.display_name || info.label}</span>
                                            <span className="text-sky-400 font-mono">Score: {scoreVal !== -Infinity ? scoreVal.toFixed(2) : '100.00'}</span>
                                          </div>
                                          <div className="text-slate-400 text-[10px]">
                                            <strong className="text-slate-200">Apex Winner:</strong> {cfgKey}
                                          </div>
                                          <div className="text-slate-400 text-[10px]">
                                            <strong className="text-slate-200">Constraint Check:</strong> {passConstraints ? 'Passed all safety guardrails & thresholds.' : 'Fallback selected due to strict constraints.'}
                                          </div>
                                          <div className="text-[10px] text-sky-300/90 mt-1 pt-1 border-t border-slate-800/60 italic">
                                            Objective score calculated via multi-variable matrix optimizer.
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-16 text-center text-slate-500 bg-slate-950/40 rounded-3xl border border-dashed border-slate-800 flex flex-col items-center justify-center gap-4 shadow-inner">
                        <span className="text-5xl mb-1 animate-bounce">📭</span>
                        <h4 className="text-lg font-bold text-slate-300">No Multi-Goal Matrix Benchmark Data Found</h4>
                        <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                          Click the <strong className="text-sky-400">Run 48-Mode Benchmark Matrix</strong> button above to execute the automated multi-goal simulation sweep. This will simulate all 6 configurations across the baseline and all 7 goal profiles and instantly populate this interactive arena.
                        </p>
                      </div>
                    )}

                    <div className="pt-8 border-t border-slate-800/50">
                      <SectionHeader title="Cloud Persistence" subtitle="Upload results, network, and system configs to MongoDB Atlas" />
                      <div className="flex flex-col gap-4">
                        <button
                          onClick={handleExportResults}
                          disabled={dbExportStatus.loading || simStatus.isRunning}
                          className={`flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-xl ${dbExportStatus.loading || simStatus.isRunning
                            ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                            }`}
                        >
                          {dbExportStatus.loading ? (
                            <div className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                          ) : <Icons.Cloud />}
                          <span>{dbExportStatus.loading ? "Uploading to Atlas..." : "Upload Last Run to Cloud Atlas"}</span>
                        </button>

                        {dbExportStatus.error && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm font-medium">
                            ⚠️ {dbExportStatus.error}
                          </div>
                        )}
                        {dbExportStatus.success && (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-medium">
                            ✅ {dbExportStatus.success}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "cloud_atlas" && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                      <SectionHeader title="Simulation Cloud Atlas" subtitle="View and inspect results uploaded to MongoDB Atlas" />
                      <button
                        onClick={handleFetchCloudResults}
                        disabled={cloudFetchStatus.loading}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all active:scale-95 shadow-lg ${cloudFetchStatus.loading
                          ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                          }`}
                      >
                        {cloudFetchStatus.loading ? (
                          <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                        ) : <Icons.Cloud />}
                        <span>{cloudFetchStatus.loading ? "Synchronizing..." : "Sync with Atlas"}</span>
                      </button>
                    </div>

                    {cloudFetchStatus.error && (
                      <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-sm font-medium flex items-center gap-3">
                        <span className="text-xl">⚠️</span> {cloudFetchStatus.error}
                      </div>
                    )}

                    {cloudResults.length === 0 && !cloudFetchStatus.loading ? (
                      <div className="flex flex-col items-center justify-center py-20 bg-slate-800/10 rounded-3xl border border-dashed border-slate-700/50">
                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-700">
                          <Icons.Cloud />
                        </div>
                        <p className="text-slate-700 font-medium">No results found in Cloud Atlas</p>
                        <p className="text-slate-700 text-sm mt-1">Click Sync to fetch latest data</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {cloudResults.map((run) => (
                          <div key={run._id} className="p-6 bg-slate-800/20 hover:bg-slate-800/30 rounded-2xl border border-slate-700/30 transition-all group relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-sky-500/10 transition-all" />

                            <div className="flex justify-between items-start mb-4 relative z-10">
                              <div>
                                <h4 className="text-lg font-bold text-slate-600 dark:text-slate-400 group-hover:text-sky-400 transition-colors">Run ID: {run.run_id}</h4>
                                <p className="text-xs text-slate-700 dark:text-slate-200 font-mono mt-1">Doc ID: {run._id}</p>
                              </div>
                              <div className="text-right">
                                <span className="px-3 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full text-[10px] font-bold uppercase tracking-wider border border-green-500/20">
                                  {new Date(run.upload_timestamp).toUTCString()}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-700/30 relative z-10">
                              <div>
                                <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-1">Scenario window</p>
                                <p className="text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                                  Start: {run.metadata?.scenario_start ? new Date(run.metadata.scenario_start).toUTCString() : "N/A"} <br />
                                  End: {run.metadata?.scenario_end ? new Date(run.metadata.scenario_end).toUTCString() : "N/A"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-1">Execution Metadata</p>
                                <p className="text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed capitalize">
                                  Type: <strong className="text-sky-500 dark:text-sky-400">{run.metadata?.run_type || "simulation"}</strong> <br />
                                  Goal: {run.metadata?.optimization_goal ? run.metadata.optimization_goal.replace(/_/g, ' ') : "N/A"} <br />
                                  Base Config: {run.metadata?.base_config_optimized ? run.metadata.base_config_optimized.replace(/_/g, ' ') : "N/A"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-1">Simulation timing</p>
                                <p className="text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                                  Start: {run.metadata?.wall_clock_start ? new Date(run.metadata.wall_clock_start).toUTCString() : "N/A"} <br />
                                  End: {run.metadata?.wall_clock_end ? new Date(run.metadata.wall_clock_end).toUTCString() : "N/A"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-6 flex flex-col gap-3 relative z-10">
                              <div className="flex gap-3">
                                <button
                                  onClick={() => handleLoadCloudRun(run.run_id)}
                                  disabled={cloudLoadStatus[run.run_id]?.loading}
                                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${cloudLoadStatus[run.run_id]?.success
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/20"
                                    }`}
                                >
                                  {cloudLoadStatus[run.run_id]?.loading ? (
                                    <div className="w-4 h-4 border-2 border-slate-300 border-t-white rounded-full animate-spin" />
                                  ) : cloudLoadStatus[run.run_id]?.success ? <Icons.Check className="w-4 h-4" /> : <Icons.Download className="w-4 h-4" />}
                                  <span>{cloudLoadStatus[run.run_id]?.loading ? "Downloading..." : cloudLoadStatus[run.run_id]?.success ? "Loaded" : "Load Local"}</span>
                                </button>

                                <button
                                  onClick={() => handleDeleteCloudRun(run.run_id)}
                                  disabled={cloudDeleteStatus[run.run_id]?.loading}
                                  className="px-4 py-3 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl transition-all border border-slate-700/50 hover:border-rose-500/30"
                                  title="Delete from Atlas"
                                >
                                  {cloudDeleteStatus[run.run_id]?.loading ? (
                                    <div className="w-4 h-4 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
                                  ) : <Icons.Trash />}
                                </button>
                              </div>

                              {cloudLoadStatus[run.run_id]?.error && (
                                <p className="text-[10px] text-rose-400 font-medium">\u001a0 Load Error: {cloudLoadStatus[run.run_id].error}</p>
                              )}
                              {cloudDeleteStatus[run.run_id]?.error && (
                                <p className="text-[10px] text-rose-400 font-medium">\u001a0 Delete Error: {cloudDeleteStatus[run.run_id].error}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

            </div>
          </main>
        </div>

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

      <style jsx global>{`
        .shadow-glow { box-shadow: 0 0 15px currentColor; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-in-from-right-4 { from { transform: translateX(1rem); } to { transform: translateX(0); } }
        .animate-in { animation: fade-in 0.4s ease-out, slide-in-from-right-4 0.4s ease-out; }
      `}</style>
    </div>
  );
}