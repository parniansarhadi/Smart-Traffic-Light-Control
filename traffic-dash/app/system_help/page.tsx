"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import ThemeToggle from "../_components/ThemeToggle";

type SystemDoc = {
  id: string;
  title: string;
  category: "core" | "network" | "analytics" | "telemetry" | "execution";
  level: "L1" | "L2" | "L3";
  icon: string;
  badge: string;
  description: string;
  mechanics: string[];
  keyComponents: { name: string; desc: string }[];
  interdependencies: string;
  fullDetails?: {
    overview: string;
    formulas: { name: string; math: string; terms: { var: string; desc: string }[]; explanation: string }[];
    workflowSteps: { step: string; title: string; desc: string }[];
    traciInteractions: string[];
    edgeCases: { title: string; desc: string }[];
  };
};

type FieldDoc = {
  id: string;
  category: string;
  name: string;
  jsonPath: string;
  defaultValue?: string;
  meaning: string;
  action: string;
  effect: string;
  impactLevel: "High" | "Medium" | "Low";
};

type ChartDoc = {
  id: string;
  section: string;
  title: string;
  icon: string;
  whatItShows: string;
  howToCompare: string;
  proTip: string;
};

type TelemetryDoc = {
  id: string;
  variable: string;
  unit: string;
  icon: string;
  whatItShows: string;
  howToAnalyze: string;
  performanceIndicator: string;
};

const SYSTEMS_DATA: SystemDoc[] = [
  {
    id: "adaptive-controller",
    title: "Adaptive Traffic Controller",
    category: "core",
    level: "L1",
    icon: "🚦",
    badge: "Core Engine",
    description: "The primary decision engine that dynamically adjusts green light durations and phase switches based on active vehicle accumulation, approach speeds, and waiting queues.",
    mechanics: [
      "Phase Tracking & Integrator: Continuously calculates an urgency score (weight) for active and competing phases using a mathematical sigmoid function.",
      "Decision Threshold Sigmoid: Compares the active phase's holding bonus against competing queues. A switch occurs when competing pressure exceeds the active phase threshold.",
      "Predictive Platoon Logic: Looks ahead at approaching upstream detectors to extend green times for dense vehicle platoons, preventing abrupt stops.",
      "Dynamic Red Limits: Imposes strict congestion limits to truncate extended green phases if opposing queues exceed physical storage capacity.",
      "Stretch Logic: Automatically adapts cycle lengths during startup phases, adverse weather conditions, or detected incidents based on Queue Dissipation Rate (QDR)."
    ],
    keyComponents: [
      { name: "PhaseTracker", desc: "Monitors active green elapsed time and ensures minimum green safety boundaries are met." },
      { name: "StarvationMonitor", desc: "Tracks maximum waiting times on red approaches to prevent perpetual starvation." },
      { name: "AdaptiveIntegrator", desc: "Aggregates queue lengths, delay proxies, and priority weights into a unified decision matrix." }
    ],
    interdependencies: "Heavily influenced by Dynamic Traffic Profiles (volume shifts) and EV Preemption bypasses.",
    fullDetails: {
      overview: "The Adaptive Traffic Controller acts as the central autonomous decision engine of the junction. Instead of relying on rigid, pre-programmed time-of-day tables, it continuously ingests high-frequency induction loop detector data to calculate dynamic phase retention bonuses and competing queue pressures. It balances green wave progression against side-street starvation using an exponential sigmoid arbitration model.",
      formulas: [
        {
          name: "Active Phase Retention Bonus (R_active)",
          math: "R_active = BaseSwitchCost + (GreenActiveBonus × N_active_moving) × ZeroWasteMultiplier",
          terms: [
            { var: "BaseSwitchCost", desc: "Foundational inertia resisting phase termination (default: 15.0)." },
            { var: "GreenActiveBonus", desc: "Awarded per moving vehicle detected approaching the active green light." },
            { var: "N_active_moving", desc: "Active count of vehicles actively approaching within the loop detector range." },
            { var: "ZeroWasteMultiplier", desc: "Boosts competing pressure by 1.5x when active approaching volume drops to zero, snapping the light instantly." }
          ],
          explanation: "This formula establishes the holding power of the active green light. E.g., if 5 cars are approaching, the retention bonus scales up dynamically. Once the platoon clears (N=0), the bonus drops to base inertia, allowing waiting streets to take over."
        },
        {
          name: "Competing Queue Urgency (P_competing)",
          math: "P_competing = Σ(Q_opposing + W_priority) × exp(SigmoidSteepness × max(0, Q_diff - QueueTolerance))",
          terms: [
            { var: "Q_opposing", desc: "Raw count of stopped vehicles on competing red approaches." },
            { var: "W_priority", desc: "Weighted queue equivalents from waiting buses or emergency vehicles." },
            { var: "SigmoidSteepness", desc: "Exponential acceleration parameter governing how aggressively pressure compounds (default: 0.25)." },
            { var: "QueueTolerance", desc: "Baseline buffer (default: 4.0 vehicles) before exponential scaling triggers." }
          ],
          explanation: "Calculates the escalating demand from waiting red approaches. The exponential sigmoid curve ensures that as queues grow beyond the tolerance threshold, switch pressure explodes non-linearly, guaranteeing bounded maximum waiting times."
        },
        {
          name: "Phase Transition Condition",
          math: "Switch Triggered IF: P_competing > R_active AND ElapsedGreen ≥ MinGreenTime",
          terms: [
            { var: "ElapsedGreen", desc: "Time elapsed since the current phase turned green." },
            { var: "MinGreenTime", desc: "Soft minimum green duration (default: 10s) required before evaluating switches." }
          ],
          explanation: "Arbitrates the exact microsecond a light switch occurs. The active phase must have satisfied its minimum green safety window, and competing queue pressure must strictly exceed the active phase's retention bonus."
        }
      ],
      workflowSteps: [
        { step: "1. Phase Initiation", title: "Minimum Safety Lockout", desc: "Upon transitioning to green, the controller initiates an internal timer and locks out all standard switch requests until MinGreenTime has elapsed, preventing rapid light flickering." },
        { step: "2. Platoon Assessment", title: "Upstream Ingestion", desc: "Continuously polls TraCI induction loop sensors placed 250m upstream to evaluate approaching vehicle density, velocity, and platoon cohesion." },
        { step: "3. Sigmoid Arbitration", title: "Micro-Step Scoring", desc: "Executes the core mathematical loop every simulation step (100ms), calculating R_active and P_competing across all directional axes." },
        { step: "4. Dynamic Red Cutoff", title: "Spillback Prevention", desc: "Monitors red approaches. If any approach exceeds MaxRedLimit (75s) or physical storage capacity (MaxCongestionVehicles), immediately forces phase termination." },
        { step: "5. Clearance & Handoff", title: "Amber & All-Red Safety", desc: "Executes mandatory yellow amber (4s) and all-red clearance intervals before granting green to the winning competing phase." }
      ],
      traciInteractions: [
        "traci.inductionloop.getLastStepVehicleNumber(detectorID): Ingests active approach counts.",
        "traci.inductionloop.getLastStepMeanSpeed(detectorID): Identifies approaching platoon velocity.",
        "traci.trafficlight.setPhase(tlsID, phaseIndex): Dynamically alters active TLS states upon arbitration victory.",
        "traci.trafficlight.setPhaseDuration(tlsID, duration): Overrides static program definitions with adaptive extensions."
      ],
      edgeCases: [
        { title: "Spillback Jamming (Center Area Lockup)", desc: "If downstream exit lanes are blocked due to congestion, green extension is suppressed to prevent vehicles from entering and blocking the intersection box." },
        { title: "Induction Loop Sensor Failure", desc: "If physical loop detectors fail or report NaN values, the system falls back to a fail-safe timer bounded by HardMaxGreenCeiling (90s) to guarantee eventual service." }
      ]
    }
  },
  {
    id: "priority-fairness",
    title: "Priority & Fairness Engine",
    category: "core",
    level: "L1",
    icon: "⚖️",
    badge: "Multi-Modal",
    description: "Ensures equitable green time distribution while providing weighted priority to Public Transport (Buses) and active Emergency Vehicles without causing total side-street gridlock.",
    mechanics: [
      "Weighted Urgency Scaling: Assigns base and urgent weight multipliers to approaching Buses and Emergency Vehicles based on wait time and ETA.",
      "Hysteresis & Streak Caps: Prevents a single high-priority corridor from monopolizing green light cycles by enforcing hard streak caps.",
      "Opposite Flow Boosting: Temporarily inflates the priority weights of opposing phases immediately following a priority hold to clear accumulated queues.",
      "Pedestrian Guardrail: Guarantees minimum walk and clearance times for active pedestrian calls before servicing conflicting vehicle priority requests."
    ],
    keyComponents: [
      { name: "UrgencyCalculator", desc: "Computes exponential weight boosts as vehicles approach urgency thresholds." },
      { name: "FairnessBalancer", desc: "Applies penalty factors to recently favored phases to restore network balance." }
    ],
    interdependencies: "Interacts directly with the Adaptive Integrator and Pedestrian Control System.",
    fullDetails: {
      overview: "A sophisticated multi-modal arbitration engine that balances the competing needs of high-occupancy public transit (Buses), emergency services, and standard civilian traffic. It employs schedule-deviation stress weighting and strict starvation streak caps to prevent transit corridors from creating perpetual side-street gridlock.",
      formulas: [
        {
          name: "Bus Urgency Weight (W_bus)",
          math: "W_bus = BusBaseWeight + BusStressWeight × (ScheduleDelay / StressThreshold) + BusWaitGain × ElapsedWait",
          terms: [
            { var: "BusBaseWeight", desc: "Default transit importance multiplier (default: 3.0)." },
            { var: "BusStressWeight", desc: "Additional weight applied when the bus is running behind timetable (default: 5.0)." },
            { var: "ScheduleDelay", desc: "Simulated delay in seconds relative to the published transit schedule." },
            { var: "BusWaitGain", desc: "Linear inflation factor per second of intersection delay." }
          ],
          explanation: "Calculates the dynamic priority weight of an approaching bus. If the bus is on time, it exerts standard priority. If running late, the stress weight escalates its priority score, helping it catch up to schedule."
        },
        {
          name: "Fairness Penalty & Opposite Boost (F_adj)",
          math: "P_opposing_adjusted = P_opposing × FairnessOppositeBoost - FairnessPenalty × RecentPriorityStreaks",
          terms: [
            { var: "FairnessOppositeBoost", desc: "Multiplier applied to side streets during active transit priority holds (default: 3.0)." },
            { var: "FairnessPenalty", desc: "Score deduction applied to arterial phases that recently received priority extensions." },
            { var: "RecentPriorityStreaks", desc: "Count of consecutive cycles where priority was granted." }
          ],
          explanation: "Ensures side streets are not starved. Following a priority hold, opposing queues are artificially boosted to guarantee immediate clearance in the subsequent cycle."
        }
      ],
      workflowSteps: [
        { step: "1. Transit Ingestion", title: "Route Subscription", desc: "Subscribes to TraCI vehicle types; identifies approaching buses and extracts schedule adherence metadata." },
        { step: "2. Weight Escalation", title: "Dynamic Urgency", desc: "Continuously updates W_bus as the bus approaches the stop line or incurs waiting delay." },
        { step: "3. Streak Arbitration", title: "Fairness Clamping", desc: "Evaluates hard_streak_cap. If the arterial phase has been extended 3 consecutive times, blocks further priority requests." },
        { step: "4. Pedestrian Guardrail Check", title: "Active Transit Safety", desc: "Verifies that active pedestrian calls have not exceeded ped_guard_threshold_s (15s)." },
        { step: "5. Post-Priority Recovery", title: "Queue Flushing", desc: "Injects recovery_bonus into opposing queues immediately following bus departure to flush accumulated civilian traffic." }
      ],
      traciInteractions: [
        "traci.vehicle.getTypeID(vehID): Identifies transit vehicles and emergency classes.",
        "traci.vehicle.getRoute(vehID): Traces path trajectories through the junction.",
        "traci.trafficlight.getCompleteRedYellowGreenDefinition(tlsID): Inspects upcoming phase sequences for priority insertion."
      ],
      edgeCases: [
        { title: "Simultaneous Bus Arrivals", desc: "When buses approach from conflicting streets, arbitrates based on schedule stress and accumulated wait time." },
        { title: "Pedestrian Lockout Prevention", desc: "If a pedestrian button has been active longer than stress_ped_wait_threshold_s, transit priority is forcefully bypassed until the crosswalk is serviced." }
      ]
    }
  },
  {
    id: "ev-preemption",
    title: "Emergency Vehicle (EV) Preemption",
    category: "core",
    level: "L1",
    icon: "🚑",
    badge: "Safety Critical",
    description: "A high-priority, safety-critical override system designed to clear intersection paths immediately for approaching emergency vehicles with active sirens.",
    mechanics: [
      "Preemption Bypass: Instantly overrides normal adaptive sigmoid logic when an EV enters the detection zone.",
      "Force Switching & Holds: Initiates an immediate phase transition (respecting yellow/red clearance safety times) and holds the green phase open until the EV clears.",
      "Safety Min Green Buffers: Ensures that conflicting phases receive a minimal safety green buffer before truncating their cycle to avoid severe driver confusion.",
      "Post-Preemption Recovery: Engages a stabilization recovery period after EV departure, utilizing opposite flow boosts to rapidly flush trapped side-street queues."
    ],
    keyComponents: [
      { name: "PreemptionDetector", desc: "Identifies EV presence, approach speed, and estimated time of arrival at the stop line." },
      { name: "RecoveryOrchestrator", desc: "Manages the transition back to standard adaptive timing post-preemption." }
    ],
    interdependencies: "Overrides all other systems; temporarily suspends Pedestrian and standard Adaptive logic.",
    fullDetails: {
      overview: "The highest-priority, safety-critical subsystem in the traffic management suite. Designed to establish an immediate, cleared path for emergency vehicles responding to active incidents. It utilizes predictive ETA tracking, advanced multi-EV tightening/relaxation arbitration, and rigorous post-preemption starvation debt accounting.",
      formulas: [
        {
          name: "EV Detection & ETA Projection (ETA_ev)",
          math: "ETA_ev = DistanceToStopLine / max(CurrentSpeed, StaleSpeedFloor)",
          terms: [
            { var: "DistanceToStopLine", desc: "Spatial distance from EV GPS coordinate to junction stop line." },
            { var: "CurrentSpeed", desc: "Instantaneous velocity of the emergency vehicle." },
            { var: "StaleSpeedFloor", desc: "Minimum velocity clamp (default: 2.0 m/s) to prevent infinite ETA from stopped EVs." }
          ],
          explanation: "Projects the exact arrival window of the emergency vehicle. If the EV is 200m away traveling at 20 m/s, ETA is 10s, triggering immediate preemption clearance."
        },
        {
          name: "Multi-EV Tightening Threshold (T_tighten)",
          math: "T_tighten = MinWaitTighten + WaitGapTighten × exp(HysteresisBase × (GapDistance / MaxDetectionDistance))",
          terms: [
            { var: "MinWaitTighten", desc: "Baseline waiting time required for a secondary EV to challenge a primary EV hold." },
            { var: "WaitGapTighten", desc: "Exponential scaling factor based on spatial separation gaps between conflicting emergency vehicles." },
            { var: "GapDistance", desc: "Physical distance between two trailing or conflicting emergency vehicles." }
          ],
          explanation: "Arbitrates complex scenarios where multiple emergency vehicles approach simultaneously from different streets, establishing a mathematically rigorous right-of-way hierarchy."
        },
        {
          name: "Civilian Relaxation Ratio (R_relax)",
          math: "Relax Triggered IF: Q_civilian_pressure > (EV_Weight × PressureRatioRelax) AND CivilianWait > MinWaitRelax",
          terms: [
            { var: "Q_civilian_pressure", desc: "Accumulated queue pressure on civilian arteries." },
            { var: "PressureRatioRelax", desc: "Configured ratio (default: 1.5) required to temporarily pause EV preemption." }
          ],
          explanation: "Allows extreme civilian gridlock to temporarily pause preemption if EV arrival is still distant, preventing total arterial collapse."
        }
      ],
      workflowSteps: [
        { step: "1. Siren Verification", title: "Spatial Scanning", desc: "Validates EV presence within max_detection_distance_m (350m) and ETA_ev ≤ detection_eta_threshold (25s)." },
        { step: "2. Civilian Clearance", title: "Safety Intervals", desc: "Initiates mandatory yellow amber (4s) and all-red clearance intervals for active civilian phases." },
        { step: "3. Preemption Hold", title: "Green Lockout", desc: "Locks the traffic light into the EV's directional green phase for up to ev_max_hold_steps." },
        { step: "4. Multi-EV Arbitration", title: "Conflict Resolution", desc: "If a second EV approaches from a conflicting street, evaluates tightening hysteresis curves to determine right-of-way." },
        { step: "5. Debt Accounting", title: "Starvation Tracking", desc: "Accumulates starvation_debt_gain_per_step for every second civilian streets are halted." }
      ],
      traciInteractions: [
        "traci.vehicle.getSpeed(vehID): Instantaneous velocity telemetry for ETA projection.",
        "traci.vehicle.getPosition(vehID): Spatial coordinate tracking.",
        "traci.trafficlight.setProgram(tlsID, programID): Instantly switches TLS into emergency override tables."
      ],
      edgeCases: [
        { title: "Stale/Parked EV Filtering", desc: "If an EV stops within the detection zone (e.g., attending an incident near the junction) and speed drops below stale_speed_floor_mps for stale_sample_steps, preemption is revoked to restore civilian flow." },
        { title: "Physical Safety Floor", desc: "Even during emergency preemption, active civilian green lights must complete safety_min_green_floor (5s) before transitioning to yellow." }
      ]
    }
  },
  {
    id: "pedestrian-control",
    title: "Pedestrian Control System",
    category: "core",
    level: "L1",
    icon: "🚶",
    badge: "Active Transit",
    description: "Protects vulnerable road users by managing dedicated walk phases, tracking curbside waiting times, and modeling physical sidewalk constraints.",
    mechanics: [
      "Call Button Ingestion: Registers pedestrian crossing requests and increments curbside waiting delay proxies.",
      "Starvation Prevention: Forces a vehicle phase transition if pedestrian waiting times exceed configured maximum patience thresholds.",
      "Dedicated Protection Intervals: Enforces strict Walk and Flashing Don't Walk clearance durations that cannot be truncated by vehicle demand.",
      "Sidewalk Geometry Modeling: Evaluates sidewalk width and curbside storage to dynamically adjust crossing priority during dense pedestrian surges."
    ],
    keyComponents: [
      { name: "CurbsideMonitor", desc: "Calculates total accumulated pedestrian waiting time and surge density." },
      { name: "ClearanceTimer", desc: "Locks out conflicting vehicle movements until full crosswalk clearance is achieved." }
    ],
    interdependencies: "Constrains the Adaptive Controller's minimum phase durations; protected against standard Bus priority.",
    fullDetails: {
      overview: "A dedicated active transit safety architecture that treats pedestrians as first-class citizens in the traffic network. It models curbside accumulation, enforces non-violable walk and clearance safety intervals, and dynamically shifts priority weighting based on active policy modes.",
      formulas: [
        {
          name: "Curbside Urgency Proxy (P_ped)",
          math: "P_ped = (WaitTime / PriorityThreshold) × ModeWeight + (PedestrianCount × ExtensionPerPed)",
          terms: [
            { var: "PriorityThreshold", desc: "Base patience limit (default: 30s)." },
            { var: "ModeWeight", desc: "Multiplier based on active mode (weight_balanced, weight_pedestrian_first, or weight_vehicle_first)." },
            { var: "ExtensionPerPed", desc: "Incremental green extension added per waiting pedestrian (default: 2s)." }
          ],
          explanation: "Quantifies curbside demand. As waiting time or pedestrian cluster size increases, the urgency proxy compounds, eventually forcing a vehicular red light."
        },
        {
          name: "Total Allocated Walk Duration (D_walk)",
          math: "D_walk = clamp(BaseDuration + PedestrianCount × ExtensionPerPed, PedSafetyMinGreen, MaxPedPhaseDuration)",
          terms: [
            { var: "BaseDuration", desc: "Foundational walk time (default: 15s)." },
            { var: "MaxPedPhaseDuration", desc: "Absolute ceiling for pedestrian green phase (default: 45s)." }
          ],
          explanation: "Dynamically sizes the walk window based on group size, guaranteeing large crowds have enough time to cross without permanently blocking vehicles."
        }
      ],
      workflowSteps: [
        { step: "1. Actuation & Accumulation", title: "Push-Button Ingestion", desc: "Registers curbside push-button events; initiates waiting timer and tracks group cluster size." },
        { step: "2. Threshold Arbitration", title: "Urgency Comparison", desc: "When waiting time exceeds priority_threshold or P_ped surpasses competing vehicle pressure, requests phase transition." },
        { step: "3. Walk Phase Execution", title: "Dedicated Green", desc: "Grants dedicated green walk signal for D_walk seconds." },
        { step: "4. Flashing Clearance", title: "Pedestrian Protection", desc: "Transitions to Flashing Don't Walk for clearance_time (10s) to allow pedestrians currently in the crosswalk to reach the curb safely." },
        { step: "5. Cooldown Lockout", title: "Vehicle Relief", desc: "Enforces mandatory cooldown timer (20s) before accepting new pedestrian calls, preventing back-to-back crosswalk lockouts." }
      ],
      traciInteractions: [
        "traci.person.getWaitingPersonList(edgeID): Identifies active pedestrian clusters at junction corners.",
        "traci.trafficlight.setPhase(tlsID, pedPhaseIndex): Orchestrates dedicated pedestrian scrambles or concurrent walk phases."
      ],
      edgeCases: [
        { title: "Extreme Pedestrian Surges", desc: "During major transit offboarding events, walk duration clamps to max_ped_phase_duration (45s) to ensure vehicular traffic eventually moves." },
        { title: "Curbside Overflow", desc: "Models sidewalk width (sidewalkWidth); if accumulation exceeds physical storage, accelerates walk phase scheduling to prevent spillover onto the active roadway." }
      ]
    }
  },
  {
    id: "env-emissions",
    title: "Environmental & Emissions Optimization",
    category: "analytics",
    level: "L1",
    icon: "🌱",
    badge: "Eco Policy",
    description: "An optimization layer that reconfigures signal switching thresholds to minimize greenhouse gas emissions, fuel consumption, and vehicle stop-and-go cycles.",
    mechanics: [
      "Stop Penalty Weighting: Heavily penalizes phase switches that force moving vehicle platoons to stop, as hard accelerations from zero velocity produce the highest CO2 spikes.",
      "Smooth Platoon Progression: Favors maintaining existing green phases for approaching vehicles to encourage steady-state eco-driving speeds.",
      "Multi-Goal Weight Shifting: Automatically alters the cost function parameters when the optimizer is set to 'Eco' mode, prioritizing fuel reduction over raw vehicle throughput."
    ],
    keyComponents: [
      { name: "EmissionsEstimator", desc: "Calculates instantaneous CO2 and fuel burn rates based on vehicle velocity and acceleration profiles." },
      { name: "EcoObjectiveFunction", desc: "Replaces standard delay-based cost matrices with environmental impact scores." }
    ],
    interdependencies: "Governed by the Optimizer Hub's active goal selection (Eco vs. Throughput vs. Balanced).",
    fullDetails: {
      overview: "A green-policy optimization layer that reconfigures the fundamental mathematical cost matrices of the signal controller. By recognizing that vehicle stops and hard accelerations from zero velocity produce the vast majority of tailpipe emissions, it alters phase-switching hysteresis to maintain smooth arterial green waves.",
      formulas: [
        {
          name: "Instantaneous CO2 Emission Estimation (E_co2)",
          math: "E_co2 = Σ(c_1 + c_2×v_i + c_3×v_i^2 + c_4×a_i)",
          terms: [
            { var: "v_i", desc: "Instantaneous velocity of vehicle i." },
            { var: "a_i", desc: "Instantaneous acceleration of vehicle i (where a_i > 0)." },
            { var: "c_1...c_4", desc: "Fuel-specific polynomial regression coefficients based on vehicle emission class." }
          ],
          explanation: "Models exact tailpipe emissions. Notice that positive acceleration (a_i) and high velocity exert massive upward pressure on CO2 output."
        },
        {
          name: "Eco-Modified Phase Switch Cost (R_eco)",
          math: "R_eco = BaseSwitchCost × (1.0 + StopPenaltyMultiplier × N_approaching_platoon)",
          terms: [
            { var: "StopPenaltyMultiplier", desc: "Weight applied to prevent stopping moving vehicle platoons." },
            { var: "N_approaching_platoon", desc: "Count of vehicles actively approaching in a coordinated platoon." }
          ],
          explanation: "Heavily inflates the retention score of the active green light if switching would force a dense, moving platoon to brake to a complete stop."
        }
      ],
      workflowSteps: [
        { step: "1. Telemetry Aggregation", title: "Kinetic Polling", desc: "Continuously polls velocity and acceleration profiles across the entire active vehicle population within the junction observable radius." },
        { step: "2. Kinetic Energy Tracking", title: "Platoon Momentum", desc: "Calculates the total kinetic energy and momentum of approaching traffic streams." },
        { step: "3. Cost Matrix Modulation", title: "Eco-Weighting", desc: "When the Optimizer Hub is set to 'Eco' mode, swaps standard delay minimization weights for stop-penalty maximization weights." },
        { step: "4. Zero-Waste Enforcement", title: "Anti-Idling", desc: "Applies zero_waste_multiplier to truncate green phases the exact instant a platoon finishes clearing, preventing idling emissions from waiting opposing cars." },
        { step: "5. Trajectory Smoothing", title: "V2X/GLOSA Broadcast", desc: "Communicates recommended approach speeds to connected vehicles to minimize hard braking events." }
      ],
      traciInteractions: [
        "traci.vehicle.getCO2Emission(vehID): Extracts high-fidelity underlying SUMO emission models.",
        "traci.vehicle.getFuelConsumption(vehID): Instantaneous fuel burn rate polling.",
        "traci.vehicle.setSpeed(vehID, speed): Modulates upstream platoon approach velocities."
      ],
      edgeCases: [
        { title: "Congestion Override", desc: "If emissions optimization causes excessive static queue buildup on side streets, the dynamic_max_red system forcefully overrides eco-retention to prevent total gridlock." },
        { title: "EV Preemption Compliance", desc: "Emergency vehicle preemption completely bypasses eco-calculations, prioritizing human safety over carbon minimization." }
      ]
    }
  },
  {
    id: "sim-optimizer",
    title: "Simulation & Optimizer Engine",
    category: "analytics",
    level: "L1",
    icon: "⚙️",
    badge: "Orchestration",
    description: "The underlying computational architecture that executes SUMO traffic simulations, performs hyperparameter tuning, and manages cloud data synchronization.",
    mechanics: [
      "Rapid Grid Search: Iterates through combinations of sigmoid weights, green limits, and starvation penalties to find optimal local configurations.",
      "Multi-Goal Matrix (48-Mode Sweep): Executes comprehensive benchmark sweeps across 48 distinct operational modes to identify 'Apex Winners' for each policy goal.",
      "Downsampling Precision: Aggregates high-frequency micro-step telemetry into downsampled macro chunks to preserve dashboard UI responsiveness without losing statistical fidelity.",
      "Cloud Atlas Synchronization: Fetches historical real-world traffic flows and backs up optimized controller profiles to a centralized cloud repository."
    ],
    keyComponents: [
      { name: "SumoOrchestrator", desc: "Manages the execution lifecycle, TraCI interfaces, and step-by-step state extraction." },
      { name: "ApexScorer", desc: "Evaluates multi-dimensional simulation outputs against specific policy objective functions." }
    ],
    interdependencies: "Supplies all telemetry to Simulation Data and Traffic Charts; receives configuration updates from Control Hub.",
    fullDetails: {
      overview: "The foundational computational orchestration engine that drives the entire traffic management dashboard. It manages the TraCI simulation lifecycle, executes multi-dimensional hyperparameter grid searches, maintains cloud synchronization with MongoDB Atlas, and performs high-precision telemetry downsampling.",
      formulas: [
        {
          name: "Multi-Goal Objective Scoring Function (S_apex)",
          math: "S_apex = w_delay×(1/AvgDelay) + w_throughput×Throughput - w_stops×StopCount - w_co2×TotalCO2 - w_starv×StarvationEvents",
          terms: [
            { var: "w_i", desc: "Dynamic weights corresponding to the active policy goal (e.g., eco, throughput, balanced)." },
            { var: "AvgDelay", desc: "Mean intersection delay across all vehicle classes." },
            { var: "StarvationEvents", desc: "Count of severe side-street starvation occurrences." }
          ],
          explanation: "The ultimate fitness function evaluated during hyperparameter optimization sweeps. Weights shift dynamically based on the selected objective goal."
        },
        {
          name: "Telemetry Downsampling Aggregation (T_macro)",
          math: "T_macro(k) = 1/N × Σ T_micro(k×N + j)",
          terms: [
            { var: "N", desc: "Downsampling factor (e.g., 10 micro-steps per macro chunk)." },
            { var: "T_micro", desc: "Raw 100ms TraCI simulation step telemetry." }
          ],
          explanation: "Downsamples high-frequency TraCI micro-steps into 1-second or 5-second macro chunks to maintain dashboard UI responsiveness without sacrificing statistical precision."
        }
      ],
      workflowSteps: [
        { step: "1. Stream Ingestion", title: "Data Loading", desc: "Fetches real-world historical traffic volume matrices from Cloud Atlas or generates synthetic route distributions." },
        { step: "2. Parallel Execution", title: "Multi-Threading", desc: "Spawns parallel TraCI simulation threads across all 6 candidate controller configurations." },
        { step: "3. Grid Search Sweeps", title: "Hyperparameter Tuning", desc: "Iterates through coarse (Phase 1) and fine (Phase 2) parameter combinations, evaluating S_apex at each step." },
        { step: "4. Apex Winner Identification", title: "Profile Persistence", desc: "Selects the highest-scoring parameter profile for each objective goal and persists it to optimization_config.json." },
        { step: "5. Cloud Atlas Backup", title: "MongoDB Atlas Sync", desc: "Packages simulation results, winning configurations, and network geometry into a unified payload for cloud persistence." }
      ],
      traciInteractions: [
        "traci.start(cmd): Initializes the SUMO binary with specified configuration files.",
        "traci.simulationStep(): Advances the TraCI simulation by one micro-step.",
        "traci.close(): Safely terminates the TraCI connection and cleans up socket handles."
      ],
      edgeCases: [
        { title: "Early Stopping on Degradation", desc: "If a candidate parameter set causes queue spillback exceeding maxQueueCap or pedestrian delay worsening above maxPedWorsenPct, the simulation thread is instantly terminated to save compute resources." },
        { title: "Automatic Baseline Refreshing", desc: "Toggles refreshBaseline to re-evaluate reference fixed-time programs whenever road network geometry or lane counts are altered." }
      ]
    }
  },
  {
    id: "traffic-profiles",
    title: "Dynamic Traffic Profiles & Volume Scaling",
    category: "network",
    level: "L1",
    icon: "📊",
    badge: "Demand Scaling",
    description: "An adaptive demand-scaling architecture that dynamically modulates internal controller parameters based on active traffic volume regimes, rush hour surges, and adverse weather conditions.",
    mechanics: [
      "Volume Regime Shifting: Automatically detects or applies High, Medium, or Low volume profiles to adjust base switch costs, green bonuses, and queue tolerances.",
      "Rush Hour Surge Multipliers: Applies aggressive flow scaling during peak commuting windows to prioritize arterial green wave progression over minor side streets.",
      "Adverse Weather Penalties: Increases safety green buffers and modifies platoon approach velocity assumptions when rain, fog, or snow conditions are active.",
      "Dynamic Headway Calibration: Calibrates vehicle insertion headways and car-following tau parameters in TraCI to reflect real-world driver caution during heavy congestion."
    ],
    keyComponents: [
      { name: "VolumeRegimeMonitor", desc: "Monitors active vehicle density and classifies the network state into discrete volume tiers." },
      { name: "SurgeOrchestrator", desc: "Injects time-of-day rush hour multipliers and modifies baseline queue tolerances." },
      { name: "WeatherAdaptor", desc: "Translates meteorological profiles into kinetic friction and headway penalty matrices." }
    ],
    interdependencies: "Directly modulates the Adaptive Traffic Controller's base inertia and sigmoid sensitivity; interacts with Optimizer Hub meta-scaling ranges.",
    fullDetails: {
      overview: "The Dynamic Traffic Profiles & Volume Scaling subsystem acts as the macro-level demand adaptation layer of the traffic management suite. Recognizing that a single static set of sigmoid weights cannot optimally govern an intersection across quiet midnight hours, torrential downpours, and gridlocked rush hours, this system continuously scales the controller's foundational mathematical constants based on active environmental and temporal regimes.",
      formulas: [
        {
          name: "Dynamic Volume Scaling Factor (S_vol)",
          math: "S_vol = BaseVolMultiplier × (1.0 + RushHourSurge × IsRushHour) × WeatherPenalty",
          terms: [
            { var: "BaseVolMultiplier", desc: "Active regime baseline multiplier (e.g., High=1.5, Med=1.0, Low=0.7)." },
            { var: "RushHourSurge", desc: "Additional percentage boost applied during peak commuting hours (default: 0.3)." },
            { var: "IsRushHour", desc: "Binary flag (1 or 0) indicating whether current simulation time falls within peak windows." },
            { var: "WeatherPenalty", desc: "Friction and caution multiplier applied during adverse weather (e.g., Rain=1.2, Snow=1.5)." }
          ],
          explanation: "Calculates the overarching volume scaling factor. This factor directly inflates or deflates the active green retention bonus and competing queue pressure thresholds in the Adaptive Controller, ensuring signal snappy-ness perfectly matches ambient demand."
        },
        {
          name: "Effective Platoon Approach Speed (V_eff)",
          math: "V_eff = V_traci_mean × (1.0 - WeatherSpeedReduction × WeatherSeverity)",
          terms: [
            { var: "V_traci_mean", desc: "Raw mean velocity polled from upstream TraCI induction loops." },
            { var: "WeatherSpeedReduction", desc: "Configured percentage reduction factor per unit of weather severity." },
            { var: "WeatherSeverity", desc: "Normalized scalar (0.0 to 1.0) representing precipitation or fog density." }
          ],
          explanation: "Models driver behavior under adverse conditions. By artificially reducing the assumed approach velocity during bad weather, the predictive platoon logic extends green windows earlier to prevent dangerous hard braking on slick pavement."
        }
      ],
      workflowSteps: [
        { step: "1. Temporal & Environmental Polling", title: "Regime Identification", desc: "Every macro simulation step, polls active temporal parameters, time-of-day clocks, and selected weather profiles." },
        { step: "2. Tier Classification", title: "Volume Matching", desc: "Compares current active vehicle insertion rates against configured thresholds to classify the junction into High, Medium, or Low volume tiers." },
        { step: "3. Parameter Modulation", title: "Weight Overriding", desc: "Overwrites the Adaptive Controller's internal memory with the regime-specific base switch costs, green bonuses, and queue tolerances defined in the Control Hub." },
        { step: "4. Headway Injection", title: "TraCI Car-Following Sync", desc: "Updates underlying SUMO Krauss/IDM car-following parameters (tau and minGap) for active vehicle fleets to reflect weather-induced driver caution." },
        { step: "5. Surge Handoff", title: "Arterial Locking", desc: "During verified rush hour peaks, temporarily widens arterial green limits while clamping minor street maximum green ceilings." }
      ],
      traciInteractions: [
        "traci.vehicle.setTau(vehID, tau): Dynamically alters driver reaction time/headway buffers based on weather severity.",
        "traci.vehicle.setMinGap(vehID, minGap): Adjusts bumper-to-bumper stopping distance in congested queues.",
        "traci.simulation.setParameter(simID, param, value): Injects global environmental modifiers into the TraCI core."
      ],
      edgeCases: [
        { title: "Sudden Flash Flooding / Severe Fog", desc: "If weather severity instantly spikes to 1.0, the system triggers an emergency override that increases all yellow amber and all-red clearance intervals by 2 seconds to guarantee physical intersection safety." },
        { title: "Off-Peak Surge Detection", desc: "If a massive localized event (e.g., stadium exit) occurs during a scheduled 'Low' volume window, the VolumeRegimeMonitor instantly overrides the time-of-day table and snaps the controller into the 'High' volume profile." }
      ]
    }
  },
  {
    id: "stretch-logic",
    title: "Stretch Logic & Incident Detection Engine",
    category: "core",
    level: "L2",
    icon: "📈",
    badge: "Adaptive Scaling",
    description: "An intelligent phase-scaling architecture that continuously tracks Queue Dissipation Rate (QDR) to dynamically stretch minimum green times during slow startups, extend maximum green ceilings during adverse weather, and detect physical intersection blockages.",
    mechanics: [
      "Startup Lost Time Stretching: Extends minimum green durations if initial queue discharge is sluggish, compensating for heavy trucks or distracted drivers.",
      "Weather Ceiling Extension: Widens the maximum green limit when rain or snow reduces vehicle discharge rates, preventing premature phase cutoff.",
      "Autonomous Incident Truncation: Detects physical accidents or stalled vehicles by monitoring severe drops in recent QDR relative to historical averages, instantly forcing an emergency phase switch."
    ],
    keyComponents: [
      { name: "QDRTracker", desc: "Measures instantaneous vehicle discharge rates across active green lanes." },
      { name: "IncidentMonitor", desc: "Compares recent QDR against historical averages to flag physical road blockages." }
    ],
    interdependencies: "Directly modulates the AdaptiveController's min_green_time and max_green_time boundaries.",
    fullDetails: {
      overview: "The Stretch Logic & Incident Detection Engine acts as the dynamic kinetic governor of the adaptive controller. By continuously calculating the Queue Dissipation Rate (QDR)—the speed at which stopped queues accelerate and clear the stop line—it dynamically flexes green time boundaries. Crucially, it serves as an automated incident detector: if a lane is physically blocked by an accident, the QDR drops to near zero, prompting the engine to instantly override standard timing tables and force a phase switch to prevent gridlock.",
      formulas: [
        {
          name: "Dynamic Minimum Green (G_min_dyn)",
          math: "G_min_dyn = G_min_base + StartupStretch × (AvgQDR < StartupQDRThreshold)",
          terms: [
            { var: "G_min_base", desc: "Configured baseline minimum green duration (default: 10s)." },
            { var: "StartupStretch", desc: "Additional green extension added during slow startup lost time (default: 5s)." },
            { var: "AvgQDR", desc: "Historical rolling average queue dissipation rate for the approach." },
            { var: "StartupQDRThreshold", desc: "Discharge rate threshold (default: 0.8) below which stretch triggers." }
          ],
          explanation: "Ensures heavy vehicle platoons have enough time to get moving. If the approach historically suffers from slow startup acceleration, the minimum green window is automatically stretched."
        },
        {
          name: "Dynamic Maximum Green (G_max_dyn)",
          math: "G_max_dyn = G_max_base + WeatherStretch × (AvgQDR < WeatherQDRThreshold)",
          terms: [
            { var: "G_max_base", desc: "Configured baseline maximum green ceiling (default: 120s)." },
            { var: "WeatherStretch", desc: "Additional green extension added during adverse weather (default: 20s)." },
            { var: "WeatherQDRThreshold", desc: "Discharge rate threshold (default: 0.6) representing rain/snow slowing." }
          ],
          explanation: "Prevents premature green cutoff during storms. When slippery roads reduce vehicle velocities, the maximum allowable green time is widened to ensure the platoon can still clear the junction."
        },
        {
          name: "Incident Blockage Condition",
          math: "Incident Triggered IF: TimeInPhase > MinIncidentTime AND RecentQDR < RecentQDRThreshold AND AvgQDR > AvgQDRMin",
          terms: [
            { var: "TimeInPhase", desc: "Elapsed green time in the current phase." },
            { var: "MinIncidentTime", desc: "Buffer period (default: 20s) before evaluating incident lockups." },
            { var: "RecentQDR", desc: "Instantaneous queue dissipation rate measured over the last few seconds." },
            { var: "RecentQDRThreshold", desc: "Severe drop threshold (default: 0.15) indicating physical blockage." }
          ],
          explanation: "The ultimate automated fail-safe against intersection lockups. If an approach historically flows well (AvgQDR > 0.5) but suddenly drops to near zero discharge despite a green light, an incident is flagged and the phase is instantly terminated."
        }
      ],
      workflowSteps: [
        { step: "1. Micro-Step Polling", title: "Detector Ingestion", desc: "Every simulation step, polls TraCI induction loops to count vehicles actively crossing the stop line." },
        { step: "2. QDR Aggregation", title: "Rate Calculation", desc: "Updates QDRTracker with recent and historical rolling averages of vehicle discharge speeds." },
        { step: "3. Boundary Flexing", title: "Min/Max Stretching", desc: "Evaluates AvgQDR against startup_qdr_threshold and weather_qdr_threshold, dynamically calculating G_min_dyn and G_max_dyn." },
        { step: "4. Incident Scanning", title: "Blockage Verification", desc: "Checks if time_in_phase > min_time (20s) and recent_qdr < recent_qdr_threshold (0.15)." },
        { step: "5. Emergency Truncation", title: "Phase Handoff", desc: "If an incident is verified, logs 'INCIDENT_DETECTED', overrides max green timers, and instantly forces a phase switch to relieve waiting streets." }
      ],
      traciInteractions: [
        "traci.inductionloop.getLastStepVehicleNumber(detID): High-frequency polling of stop-line crossing events.",
        "traci.trafficlight.setPhaseDuration(tlsID, duration): Overrides active phase lengths based on stretched boundaries."
      ],
      edgeCases: [
        { title: "False Positive Filtering in Light Traffic", desc: "If a green light is active but no vehicles are approaching, RecentQDR naturally drops to 0. The engine checks upstream detector occupancy to ensure an incident is only flagged if vehicles are actually present and stopped." },
        { title: "Sensor Freezing / Disconnection", desc: "If TraCI throws socket exceptions or returns corrupted detector payloads, the engine bypasses stretch calculations and defaults to G_max_base." }
      ]
    }
  },
  {
    id: "predictive-logic",
    title: "Predictive Platoon 'Perfect Green' Subsystem",
    category: "core",
    level: "L2",
    icon: "🔮",
    badge: "Platoon Progression",
    description: "A predictive green-extension layer that calculates the precise duration required to clear an initial standing queue, automatically lowering holding barriers once the platoon clears to ensure snappy phase transitions.",
    mechanics: [
      "Perfect Green Calculation: Estimates the exact time needed to discharge a standing queue based on initial queue length and average QDR.",
      "Clearance Buffer Addition: Adds a configurable safety time buffer to accommodate trailing platoon stragglers.",
      "Post-Perfect Threshold Discounting: Multiplicatively discounts the active green retention bonus once the perfect green window elapses, allowing waiting side streets to take over immediately."
    ],
    keyComponents: [
      { name: "PlatoonPredictor", desc: "Calculates required green duration based on initial standing queue size." },
      { name: "ThresholdDiscounter", desc: "Applies post-perfect multiplier discount to active phase retention bonuses." }
    ],
    interdependencies: "Operates within the AdaptiveController's core switching loop; interacts with QDRTracker.",
    fullDetails: {
      overview: "The Predictive Platoon 'Perfect Green' Subsystem acts as the forward-looking optimization layer of the adaptive controller. Instead of passively waiting for gaps in traffic, it inspects the initial standing queue the microsecond a light turns green. Using historical Queue Dissipation Rates, it forecasts the exact second the queue will finish clearing. Once this 'Perfect Green' window elapses, it aggressively discounts the active green retention bonus, preventing trailing stragglers from holding the light open unnecessarily.",
      formulas: [
        {
          name: "Predictive Perfect Green Time (T_perfect)",
          math: "T_perfect = (StartQueue / max(AvgQDR, 0.2)) + ClearanceBuffer",
          terms: [
            { var: "StartQueue", desc: "Exact count of stopped vehicles when the phase transitioned to green." },
            { var: "AvgQDR", desc: "Historical average queue dissipation rate (vehicles per second)." },
            { var: "ClearanceBuffer", desc: "Safety time buffer (default: 5.0s) added to accommodate trailing stragglers." }
          ],
          explanation: "Calculates the exact physical time required to flush the standing queue. E.g., if 20 cars are waiting and AvgQDR is 2.0 veh/s, T_perfect is 10s + 5s buffer = 15s."
        },
        {
          name: "Post-Perfect Threshold Discounting (R_discounted)",
          math: "R_discounted = R_active × (PostPerfectMultiplier IF TimeInPhase > T_perfect ELSE 1.0)",
          terms: [
            { var: "R_active", desc: "Base active phase retention bonus calculated via sigmoid logic." },
            { var: "PostPerfectMultiplier", desc: "Configured discount factor (default: 0.75 or 0.25) applied after T_perfect." }
          ],
          explanation: "Lowers the barrier for competing streets. Once the standing platoon has successfully cleared, the holding power of the green light is slashed by 25% to 75%, allowing waiting red traffic to easily interrupt."
        }
      ],
      workflowSteps: [
        { step: "1. Phase Transition Snapshot", title: "Queue Latching", desc: "The microsecond a phase turns green, latches the exact count of stopped vehicles from upstream TraCI detectors." },
        { step: "2. Projection Latching", title: "T_perfect Calculation", desc: "Computes T_perfect using latched StartQueue and active AvgQDR." },
        { step: "3. Active Monitoring", title: "Elapsed Timer", desc: "Tracks time_in_phase against the latched T_perfect threshold every simulation step." },
        { step: "4. Threshold Modulation", title: "Discount Injection", desc: "Once time_in_phase > T_perfect, injects post_perfect_threshold_mult into the AdaptiveController's sigmoid arbitration loop." },
        { step: "5. Platoon Termination", title: "Snappy Handoff", desc: "Allows waiting competing red queues to instantly trigger a phase transition the moment the primary platoon clears." }
      ],
      traciInteractions: [
        "traci.lane.getLastStepHaltingNumber(laneID): Latches initial standing queue counts upon phase transition.",
        "traci.trafficlight.getNextSwitch(tlsID): Coordinates remaining phase allocations with predictive projections."
      ],
      edgeCases: [
        { title: "Zero Standing Queue on Green", desc: "If a phase turns green but StartQueue is 0 (e.g., during a forced pedestrian call), T_perfect defaults to ClearanceBuffer (5s), after which threshold discounting applies immediately." },
        { title: "Platoon Spillback Jamming", desc: "If downstream congestion prevents the queue from discharging at AvgQDR, T_perfect will elapse before the queue physically clears. The system relies on dynamic_max_red to prevent box lockup." }
      ]
    }
  },
  {
    id: "rush-hour-config",
    title: "Time-of-Day Commute Surge & Directional Biasing",
    category: "network",
    level: "L2",
    icon: "⏰",
    badge: "Commute Biasing",
    description: "A temporal orchestration layer that tracks wall-clock time or simulation steps to identify peak commuting windows, applying aggressive directional multipliers to favor major arterial corridors.",
    mechanics: [
      "Peak Commute Tracking: Synchronizes with real-world wall-clock timestamps or simulation step equivalents to detect Morning and Evening rush hours.",
      "Directional Sigmoid Biasing: Multiplicatively inflates North-South holding thresholds in the morning and East-West thresholds in the evening.",
      "Suppressed Biasing Guardrail: Automatically suppresses directional bias if the opposing street has no active vehicle lanes, preventing pedestrian starvation."
    ],
    keyComponents: [
      { name: "TimeOfDayClock", desc: "Tracks active simulation time against configured peak commuting hours." },
      { name: "BiasModulator", desc: "Applies directional multipliers to core sigmoid arbitration thresholds." }
    ],
    interdependencies: "Directly multiplies the output of calculate_sigmoid_threshold in AdaptiveController.",
    fullDetails: {
      overview: "The Time-of-Day Commute Surge & Directional Biasing subsystem acts as the macro-temporal scheduling layer of the intersection. Recognizing that commuter traffic exhibits massive directional asymmetry (e.g., inbound to city centers in the morning, outbound in the evening), this system applies aggressive directional bias multipliers to the core sigmoid arbitration engine, guaranteeing green wave progression for peak arterial flows.",
      formulas: [
        {
          name: "Biased Sigmoid Threshold (T_biased)",
          math: "T_biased = T_sigmoid × (NS_Bias IF Direction=NS ELSE EW_Bias) × SuppressBiasGuard",
          terms: [
            { var: "T_sigmoid", desc: "Raw sigmoid threshold calculated from active green volume and red waiting pressure." },
            { var: "NS_Bias / EW_Bias", desc: "Active time-of-day directional multipliers (e.g., Morning NS=0.6, EW=1.4)." },
            { var: "SuppressBiasGuard", desc: "Binary clamp (1.0 or 0.0) that suppresses bias if opposing street lacks vehicle lanes." }
          ],
          explanation: "Modulates the holding barrier based on commute direction. In the morning rush, East-West threshold is multiplied by 1.4, making it much harder for minor side streets to interrupt North-South arterial flow."
        }
      ],
      workflowSteps: [
        { step: "1. Temporal Synchronization", title: "Clock Polling", desc: "Every macro step, polls start_datetime wall-clock time or simulation step equivalents." },
        { step: "2. Regime Detection", title: "Rush Hour Matching", desc: "Identifies whether current time falls within morning_rush_start/end or evening_rush_start/end windows." },
        { step: "3. Bias Latching", title: "Multiplier Injection", desc: "Assigns configured ns_bias and ew_bias values to the AdaptiveController's active memory state." },
        { step: "4. Guardrail Verification", title: "Pedestrian Safety Check", desc: "Checks if opposing approaches contain active vehicle lanes. If false, forces SuppressBiasGuard=1.0 to ensure pedestrians are not starved." },
        { step: "5. Threshold Multiplication", title: "Arbitration Execution", desc: "Multiplies current_threshold by latched directional bias during every micro-step sigmoid arbitration cycle." }
      ],
      traciInteractions: [
        "traci.simulation.getTime(): Polls active simulation step timestamps.",
        "traci.trafficlight.setPhase(tlsID, phase): Executes biased phase transitions favoring peak commute arteries."
      ],
      edgeCases: [
        { title: "Weekend / Holiday Schedule Override", desc: "If start_datetime indicates a weekend or holiday, the TimeOfDayClock automatically overrides rush hour windows and locks ns_bias and ew_bias to 1.0 (Balanced mode)." },
        { title: "Emergency Vehicle Override", desc: "Active EV preemption completely ignores time-of-day directional biasing, instantly granting right-of-way to the emergency approach regardless of commute peak direction." }
      ]
    }
  },
  {
    id: "dynamic-max-red",
    title: "Dynamic Red & Spillback Prevention Subsystem",
    category: "core",
    level: "L2",
    icon: "🛑",
    badge: "Gridlock Prevention",
    description: "A safety guardrail system that monitors red approach waiting times and physical intersection storage capacity, immediately truncating active green phases to prevent gridlock spillback.",
    mechanics: [
      "Max Red Clamping: Enforces a strict upper ceiling on red light waiting times, overriding active green extensions if side streets are starved.",
      "Spillback Storage Monitoring: Tracks vehicle accumulation within the physical intersection box; forces phase termination if downstream storage capacity is exhausted.",
      "Starvation Compensation: Injects compensation green time bonuses to recently starved approaches in subsequent cycles."
    ],
    keyComponents: [
      { name: "SpillbackMonitor", desc: "Tracks active vehicle accumulation within the physical intersection center box." },
      { name: "RedStarvationTimer", desc: "Monitors maximum continuous waiting time across stopped red approaches." }
    ],
    interdependencies: "Overrides AdaptiveController green extensions; operates as a hard safety cutoff.",
    fullDetails: {
      overview: "The Dynamic Red & Spillback Prevention Subsystem acts as the ultimate physical safety valve of the intersection. It operates two critical guardrails: first, it monitors stopped red approaches to ensure no street is starved beyond max_red_limit (e.g., 120s). Second, it inspects the physical center box of the junction. If downstream exit lanes jam and vehicle accumulation exceeds max_congestion_vehicles (e.g., 80 cars), it instantly truncates the active green light to prevent vehicles from entering and permanently locking up the intersection grid.",
      formulas: [
        {
          name: "Spillback Cutoff Condition",
          math: "Cutoff Triggered IF: MaxRedWait > MaxRedLimit OR CenterBoxVehicles > MaxCongestionVehicles",
          terms: [
            { var: "MaxRedWait", desc: "Maximum continuous waiting time observed on any stopped red approach." },
            { var: "MaxRedLimit", desc: "Configured absolute waiting ceiling (default: 120s)." },
            { var: "CenterBoxVehicles", desc: "Active count of vehicles physically present within the intersection center box." },
            { var: "MaxCongestionVehicles", desc: "Physical storage limit of the junction box (default: 80 vehicles)." }
          ],
          explanation: "The hard cutoff guardrail. If side streets wait too long, or if the intersection box fills up with gridlocked cars, the green light is forcefully terminated."
        },
        {
          name: "Starvation Compensation Bonus (B_comp)",
          math: "B_comp = CompensationDuration × (PreviousRedWait > MaxRedLimit)",
          terms: [
            { var: "CompensationDuration", desc: "Guaranteed minimum green extension awarded to starved approaches (default: 15s)." },
            { var: "PreviousRedWait", desc: "Peak waiting time endured by the approach during its previous red cycle." }
          ],
          explanation: "Ensures equity after severe starvation. If a street was forced to wait beyond the red limit, it receives a guaranteed 15-second green bonus in its next cycle to flush trapped queues."
        }
      ],
      workflowSteps: [
        { step: "1. Red Approach Polling", title: "Starvation Tracking", desc: "Every simulation step, polls traci.lane.getWaitingTime across all stopped red approaches." },
        { step: "2. Box Occupancy Polling", title: "Gridlock Tracking", desc: "Counts active vehicle IDs physically located within the central intersection polygon." },
        { step: "3. Cutoff Evaluation", title: "Guardrail Check", desc: "Evaluates Spillback Cutoff Condition. If true, latches target relief direction." },
        { step: "4. Forced Truncation", title: "Phase Termination", desc: "Logs 'DYNAMIC_RED_FORCE', overrides active green timers, and initiates immediate yellow amber clearance." },
        { step: "5. Compensation Latching", title: "Debt Repayment", desc: "Records starvation debt and awards B_comp green extension to the starved approach upon its transition to green." }
      ],
      traciInteractions: [
        "traci.junction.getPosition(junctionID): Retrieves central intersection polygon coordinates for box occupancy tracking.",
        "traci.lane.getLastStepHaltingNumber(laneID): Monitors stopped queue accumulation on starved red approaches."
      ],
      edgeCases: [
        { title: "Downstream Spillback Gridlock", desc: "If downstream exit lanes are completely blocked by an adjacent intersection, granting green will only cause vehicles to enter and block the box. The system suppresses green until downstream storage clears." },
        { title: "Simultaneous Multi-Approach Starvation", desc: "If multiple side streets exceed MaxRedLimit simultaneously, arbitrates relief order based on accumulated queue length and active priority vehicle presence." }
      ]
    }
  },
  {
    id: "network-geometry",
    title: "Network Geometry & Center Box Collision Engine",
    category: "network",
    level: "L2",
    icon: "🗺️",
    badge: "Physical Topology",
    description: "The foundational structural modeling layer that defines lane capacities, upstream detector placements, sidewalk widths, and enforces central box yellow-grid collision avoidance.",
    mechanics: [
      "Upstream Sensor Mapping: Establishes virtual TraCI induction loops 250m upstream to feed predictive platoon algorithms.",
      "Center Box Collision Enforcement: Toggles strict TraCI junction collision checking to prevent vehicles from entering the central box if their exit path is blocked.",
      "Sidewalk Geometry Constraints: Models physical sidewalk widths to constrain curbside pedestrian storage before spillover occurs."
    ],
    keyComponents: [
      { name: "NetworkConstructor", desc: "Parses underlying SUMO .net.xml files to extract lane counts and observable lengths." },
      { name: "CenterBoxArbitrator", desc: "Enforces physical yellow-grid collision avoidance rules within the junction polygon." }
    ],
    interdependencies: "Provides the physical road network topology to all simulation controllers and TraCI APIs.",
    fullDetails: {
      overview: "The Network Geometry & Center Box Collision Engine serves as the foundational structural blueprint of the simulation environment. It bridges the physical road topology defined in SUMO network files with the dynamic logic of the React dashboard. It dictates the exact placement of upstream virtual induction loop sensors (e.g., 250m from the stop line), models physical sidewalk holding capacities, and enforces rigorous yellow-grid center box collision avoidance to prevent unrealistic vehicle overlapping.",
      formulas: [
        {
          name: "Physical Approach Storage Capacity (C_app)",
          math: "C_app = (ObservableLength / AvgVehicleLength) × LanesCount",
          terms: [
            { var: "ObservableLength", desc: "Physical distance covered by upstream TraCI detectors (default: 250m)." },
            { var: "AvgVehicleLength", desc: "Assumed average physical length of a vehicle plus bumper gap (default: 7.5m)." },
            { var: "LanesCount", desc: "Total number of approaching lanes on the directional corridor." }
          ],
          explanation: "Calculates the maximum possible vehicle queue that can be physically stored and tracked on an approach. E.g., a 3-lane approach with 250m observable length can store approximately 100 vehicles."
        },
        {
          name: "Curbside Pedestrian Storage Limit (C_ped)",
          math: "C_ped = (SidewalkWidth × CornerLength) × PedDensityFactor",
          terms: [
            { var: "SidewalkWidth", desc: "Physical width of the sidewalk waiting area (default: 3.0m)." },
            { var: "CornerLength", desc: "Physical length of the intersection corner curb (default: 10.0m)." },
            { var: "PedDensityFactor", desc: "Maximum safe packing density (default: 2.0 pedestrians per square meter)." }
          ],
          explanation: "Models physical sidewalk capacity. If waiting pedestrian clusters exceed C_ped (e.g., 60 people), the PedestrianHandler accelerates walk phase scheduling to prevent dangerous spillover onto the active roadway."
        }
      ],
      workflowSteps: [
        { step: "1. Topology Parsing", title: "XML Ingestion", desc: "At simulation startup, parses SUMO .net.xml files to extract lane counts, lengths, and traffic light definitions." },
        { step: "2. Detector Initialization", title: "Sensor Placement", desc: "Dynamically instantiates virtual TraCI induction loop detectors at configured observable_length distances." },
        { step: "3. Box Polygon Mapping", title: "Center Area Latching", desc: "Latches the exact 2D polygon coordinates of the physical intersection center box." },
        { step: "4. Collision Enforcement", title: "Yellow-Grid Arbitrator", desc: "During simulation execution, monitors vehicle trajectories entering the box polygon to enforce collision avoidance." },
        { step: "5. Capacity Broadcast", title: "UI State Sync", desc: "Broadcasts physical lane counts and sidewalk widths to the React frontend for accurate Control Hub rendering." }
      ],
      traciInteractions: [
        "traci.lane.getLength(laneID): Retrieves physical lane distances for storage capacity calculations.",
        "traci.junction.getShape(junctionID): Retrieves 2D boundary polygons for center box collision tracking."
      ],
      edgeCases: [
        { title: "Asymmetric Lane Configurations", desc: "If an approach features dedicated turn pockets that are shorter than the main arterial lanes, the engine calculates separate storage capacities for through lanes versus turning pockets." },
        { title: "Dynamic Lane Closure Override", desc: "If an incident or roadwork closes a physical lane during simulation, the engine instantly recalculates C_app and broadcasts updated capacity constraints to the AdaptiveController." }
      ]
    }
  },
  {
    id: "cloud-atlas-sync",
    title: "Cloud Atlas Database Synchronization Subsystem",
    category: "telemetry",
    level: "L2",
    icon: "☁️",
    badge: "Cloud Persistence",
    description: "A robust data orchestration pipeline that interfaces with MongoDB Atlas to ingest real-world historical traffic volume matrices and persist optimized controller profiles and simulation telemetry.",
    mechanics: [
      "Historical Matrix Ingestion: Fetches real-world traffic volume distributions, turning ratios, and vehicle fleet compositions from Cloud Atlas collections.",
      "Telemetry Payload Packaging: Compresses high-frequency micro-step simulation results into macro chunks for cloud backup.",
      "Automated Profile Synchronization: Uploads winning hyperparameter configurations (system_param_config.json) to cloud storage after multi-goal optimization sweeps."
    ],
    keyComponents: [
      { name: "MongoTrafficImporter", desc: "Fetches historical traffic flow matrices and turning ratios from MongoDB Atlas." },
      { name: "MongoResultsExporter", desc: "Packages and persists simulation telemetry and winning configurations to cloud collections." }
    ],
    interdependencies: "Bridges the local SUMO simulation environment with external cloud data infrastructure.",
    fullDetails: {
      overview: "The Cloud Atlas Database Synchronization Subsystem acts as the enterprise data bridge of the traffic management dashboard. It connects the local SUMO simulation engine and Next.js backend with remote MongoDB Atlas cloud clusters. It operates a two-way pipeline: before simulation starts, it imports high-fidelity historical traffic volume matrices and turning ratios. After simulation or hyperparameter optimization sweeps complete, it compresses and exports detailed telemetry, phase switch logs, and winning controller configurations back to the cloud for permanent enterprise persistence.",
      formulas: [
        {
          name: "Telemetry Compression Ratio (R_comp)",
          math: "R_comp = Size(RawMicroTelemetry) / Size(CompressedMacroPayload)",
          terms: [
            { var: "RawMicroTelemetry", desc: "Uncompressed 100ms step-by-step TraCI simulation logs." },
            { var: "CompressedMacroPayload", desc: "Downsampled, gzipped JSON payload packaged for MongoDB insertion." }
          ],
          explanation: "Measures cloud transmission efficiency. By downsampling micro-steps into macro chunks and applying gzip compression, the subsystem achieves a 20:1 compression ratio, drastically reducing cloud bandwidth costs."
        },
        {
          name: "Cloud Sync Latency Bounding (L_sync)",
          math: "L_sync = NetworkRTT + MongoInsertTime < MaxSyncTimeout",
          terms: [
            { var: "NetworkRTT", desc: "Round-trip network latency to the MongoDB Atlas cluster." },
            { var: "MongoInsertTime", desc: "Database execution time for bulk document insertion." },
            { var: "MaxSyncTimeout", desc: "Configured maximum allowable sync delay (default: 5000ms)." }
          ],
          explanation: "Guarantees dashboard UI responsiveness. Cloud synchronization is executed asynchronously in background worker threads to ensure the user interface never freezes during large database uploads."
        }
      ],
      workflowSteps: [
        { step: "1. Cluster Authentication", title: "Connection Pooling", desc: "Establishes secure, pooled TLS connections to MongoDB Atlas using configured MONGODB_URI credentials." },
        { step: "2. Matrix Ingestion", title: "Flow Fetching", desc: "Queries historical traffic collections to extract volume profiles, turning percentages, and vehicle fleet compositions." },
        { step: "3. Simulation Execution", title: "Local Buffer Latching", desc: "Caches high-frequency simulation telemetry in local memory buffers during TraCI execution." },
        { step: "4. Payload Compression", title: "Macro Downsampling", desc: "Aggregates and compresses local memory buffers into optimized JSON macro payloads upon simulation completion." },
        { step: "5. Cloud Persistence", title: "Bulk Upsert", desc: "Executes bulk upsert operations to store simulation results, winning configurations, and network geometry in Cloud Atlas." }
      ],
      traciInteractions: [
        "traci.simulation.getCollisions(): Extracts collision telemetry for cloud incident logging.",
        "traci.simulation.getArrivedNumber(): Extracts total completed trip counts for throughput validation."
      ],
      edgeCases: [
        { title: "Cloud Network Disconnection / Timeout", desc: "If the MongoDB Atlas cluster is unreachable due to network outages, the subsystem caches payloads locally in SQLite backup files and initiates exponential backoff retries." },
        { title: "Concurrent Optimization Overwrite Collision", desc: "If multiple optimization workers attempt to update system_param_config.json simultaneously, the subsystem uses optimistic locking and timestamp arbitration to prevent race conditions." }
      ]
    }
  },
  {
    id: "traffic-data-processing",
    title: "Traffic Stream Ingestion & Synthetic Trip Generator Subsystem",
    category: "network",
    level: "L2",
    icon: "📡",
    badge: "Stream Ingestion",
    description: "An advanced data ingestion and denoising engine that processes raw time-series traffic stream snapshots, applying median filtering to extract unique vehicle arrivals and injecting synthetic emergency vehicle trips.",
    mechanics: [
      "Median Filter Denoising: Applies a 5-frame sliding median filter to raw induction loop and camera signals to eliminate sensor flickering and false double-counts.",
      "Unique Arrival Extraction: Tracks positive deltas in filtered vehicle occupancy signals to latch the exact simulation second a unique vehicle or pedestrian arrives.",
      "Synthetic Preemption Injection: Deterministically injects emergency vehicle trips into baseline traffic matrices at configured percentage ratios."
    ],
    keyComponents: [
      { name: "TrafficDataProcessing", desc: "Main ingestion class that parses JSON traffic stream frames and manages historical sliding windows." },
      { name: "RobustEntityCounter", desc: "Denoising and arrival detection module that processes raw sensor signals." }
    ],
    interdependencies: "Generates the foundational traffic_trips.rou.xml and traffic_lights.add.xml files for SUMO execution.",
    fullDetails: {
      overview: "The Traffic Stream Ingestion & Synthetic Trip Generator Subsystem acts as the data ingestion gateway of the simulation suite. Operating directly on raw JSON time-series traffic stream frames (e.g., from roadside cameras or induction loops), it addresses the universal challenge of sensor flickering. By applying a 5-frame median filter, it smooths out noisy signals, accurately isolates unique vehicle arrivals, injects synthetic emergency vehicle demand, and compiles the final SUMO XML route definitions.",
      formulas: [
        {
          name: "Median Filter Denoising (S_smooth)",
          math: "S_smooth[i] = Median(S[i - w/2] ... S[i + w/2])",
          terms: [
            { var: "S", desc: "Raw, unfiltered vehicle detection count at simulation frame i." },
            { var: "w", desc: "Sliding window size (default: 5 frames) used for median calculation." }
          ],
          explanation: "Eliminates sensor noise. E.g., if a detector flickers [1, 0, 1, 1, 1], the median filter outputs [1, 1, 1, 1, 1], preventing the system from falsely counting multiple vehicle arrivals."
        },
        {
          name: "Unique Arrival Delta (D_arrival)",
          math: "D_arrival = max(0, S_smooth[i] - S_smooth[i-1])",
          terms: [
            { var: "S_smooth[i]", desc: "Smoothed vehicle presence count at the current frame." },
            { var: "S_smooth[i-1]", desc: "Smoothed vehicle presence count at the previous frame." }
          ],
          explanation: "Isolates new arrivals. If smoothed occupancy increases from 3 to 5 vehicles, exactly 2 unique arrival events are latched and assigned to the current simulation timestamp."
        }
      ],
      workflowSteps: [
        { step: "1. Snapshot Ingestion", title: "JSON Parsing", desc: "Scans input_data/traffic_stream/ for timestamped JSON traffic frames, sorting them chronologically." },
        { step: "2. Signal Denoising", title: "Median Filtering", desc: "Passes raw vehicle and pedestrian counts through robust_entity_counter to eliminate sensor flickering." },
        { step: "3. Arrival Latching", title: "Delta Tracking", desc: "Calculates positive deltas in smoothed signals to generate discrete vehicle arrival timestamps." },
        { step: "4. Synthetic Injection", title: "EV Generation", desc: "If add_emergency is enabled, randomly selects arrival frames to inject synthetic emergency vehicle IDs." },
        { step: "5. Route Compilation", title: "XML Export", desc: "Translates high-level directions (e.g., SOUTHTONORTH) into SUMO edge mappings (S2C -> C2N) and writes traffic_trips.rou.xml." }
      ],
      traciInteractions: [
        "XML Generation Only: Operates as a pre-simulation compilation step; does not execute active TraCI calls during simulation runs."
      ],
      edgeCases: [
        { title: "Missing / Corrupted Snapshot Frames", desc: "If a gap occurs in the chronological JSON stream, the subsystem interpolates missing frames using linear regression from adjacent time windows." },
        { title: "Zero Demand Ingestion", desc: "If the input folder contains empty snapshots, the subsystem generates a baseline minimal background flow (1 car per minute) to ensure simulation stability." }
      ]
    }
  },
  {
    id: "network-manager",
    title: "Dynamic Network Layout & Topology Orchestrator",
    category: "network",
    level: "L2",
    icon: "🔀",
    badge: "Network Orchestration",
    description: "The macro-level structural engine that executes netconvert to compile physical road networks, allocates vehicle fleet compositions via the largest-remainder method, and injects directional commute surges.",
    mechanics: [
      "Automated Netconvert Execution: Dynamically compiles SUMO .net.xml files from raw node and edge configurations, automatically guessing pedestrian crossings and walking areas.",
      "Largest-Remainder Fleet Allocation: Distributes integer vehicle counts across fleet categories (Car, Truck, Bus, Motorcycle, EV) to match exact percentage targets without rounding errors.",
      "Commute Surge Injection: Generates deterministic, heavily imbalanced directional flows (e.g., Morning North-South arterial waves) to stress-test adaptive controllers."
    ],
    keyComponents: [
      { name: "NetworkManager", desc: "Executes netconvert, manages SUMO configuration file generation, and injects rush hour flows." },
      { name: "NetworkConstructor", desc: "Parses dashboard layout configurations to calculate physical node distances from observable lengths." }
    ],
    interdependencies: "Provides the physical road network and route files required by SimulationManager.",
    fullDetails: {
      overview: "The Dynamic Network Layout & Topology Orchestrator acts as the macro-level structural compiler of the traffic simulation suite. It bridges the user's Control Hub UI settings with the low-level SUMO binary. When a user modifies observable lane lengths or toggles pedestrian crosswalks, this orchestrator recalculates physical node coordinates, executes SUMO's netconvert utility to build the .net.xml file, allocates exact vehicle fleet percentages using the largest-remainder method, and injects morning/evening commute surges.",
      formulas: [
        {
          name: "Largest-Remainder Fleet Allocation",
          math: "BaseCount_k = floor(TotalTrips × Weight_k); Remainder_k = (TotalTrips × Weight_k) - BaseCount_k",
          terms: [
            { var: "TotalTrips", desc: "Total number of vehicle trips generated for the simulation horizon." },
            { var: "Weight_k", desc: "Target percentage share for vehicle category k (e.g., Car=0.70, Truck=0.10, Bus=0.08)." }
          ],
          explanation: "Guarantees exact integer distribution. After assigning floor base counts, remaining unallocated trips are distributed one-by-one to categories with the largest decimal remainders, ensuring zero rounding loss."
        },
        {
          name: "Node Coordinate Scaling (Y_node)",
          math: "Y_node = ObservableLength_Direction IF Direction=North/South ELSE X_node = ObservableLength_Direction",
          terms: [
            { var: "ObservableLength", desc: "Configured physical length of the approach lane (default: 100m to 250m)." }
          ],
          explanation: "Translates UI inputs into physical geometry. E.g., if North approach length is set to 250m in the UI, the North source node is placed at exact coordinate (0, 250) in the SUMO network."
        }
      ],
      workflowSteps: [
        { step: "1. Config Ingestion", title: "Layout Parsing", desc: "Reads network_layout_config.json to extract lane counts, sidewalk widths, and observable lengths." },
        { step: "2. XML Synthesis", title: "Node/Edge Creation", desc: "Writes my.nod.xml and my.edg.xml files defining physical junction coordinates and lane permissions." },
        { step: "3. Binary Compilation", title: "Netconvert Execution", desc: "Invokes netconvert with --crossings.guess true to build my.net.xml. Implements automated fallback templates if binary segfaults occur." },
        { step: "4. Fleet Distribution", title: "Trip Allocation", desc: "Invokes randomTrips.py and applies _allocate_weighted_counts to assign exact Car, Truck, Bus, and EV identities." },
        { step: "5. Surge Injection", title: "Flow Writing", desc: "Appends deterministic morning (N2S/S2N) and evening (E2W/W2E) rush hour flows into flows.rou.xml." }
      ],
      traciInteractions: [
        "Subprocess Execution Only: Orchestrates external SUMO CLI tools (netconvert, randomTrips.py); does not use TraCI."
      ],
      edgeCases: [
        { title: "Netconvert Binary Segfault", desc: "In certain Colab or containerized environments, netconvert may crash when guessing walking areas. The orchestrator catches SIGSEGV and retries with basic flags, falling back to a bundled template if necessary." },
        { title: "Zero Fleet Category Allocation", desc: "If TotalTrips is too low to satisfy a 1% EV weight (e.g., 50 total trips), the largest-remainder method ensures at least 1 EV is assigned if its remainder is highest among competing fractional categories." }
      ]
    }
  },
  {
    id: "simulation-logger",
    title: "High-Frequency Telemetry & Asynchronous I/O Logging Subsystem",
    category: "telemetry",
    level: "L2",
    icon: "🖨️",
    badge: "High-Frequency I/O",
    description: "A highly optimized logging architecture that manages persistent, unbuffered file handles to prevent I/O bottlenecks during micro-step TraCI execution, featuring emoji-coded event classification.",
    mechanics: [
      "Persistent Unbuffered Handles: Maintains an open, unbuffered file stream (file_handle.flush()) throughout the simulation lifecycle to eliminate file-open overhead during 100ms TraCI steps.",
      "Specialized EV Lifecycle Tracing: Tracks emergency vehicles through discrete phases: DETECTED, PREEMPT_ACTIVE, APPROACHING, PASSED, and CLEARED_NETWORK.",
      "Priority Trapping Verification: Logs cross-priority waiting states (CROSS_PRIORITY) when multiple EVs approach simultaneously, verifying that higher-urgency vehicles maintain right-of-way."
    ],
    keyComponents: [
      { name: "SimulationLogger", desc: "Main logging class managing file streams and formatting event payloads." },
      { name: "DualLogger", desc: "Synchronous wrapper class that mirrors console output to both sys.stdout and log files." }
    ],
    interdependencies: "Invoked by SimulationManager, AdaptiveController, PrioritySystem, and StarvationMonitor.",
    fullDetails: {
      overview: "The High-Frequency Telemetry & Asynchronous I/O Logging Subsystem acts as the high-fidelity auditing and diagnostic core of the simulation engine. In high-fidelity TraCI simulations, opening and closing log files every 100ms micro-step creates massive I/O bottlenecks. This subsystem solves this by holding a persistent, unbuffered file handle. It categorizes every simulation event using an intuitive emoji-coding schema (🚨 for EV detection, 🟢 for preemption active, 🔄 for adaptive phase switches) and tracks the complete lifecycle of emergency preemption events.",
      formulas: [
        {
          name: "I/O Latency Bounding (L_log)",
          math: "L_log = Time(Write) + Time(Flush) < MaxStepLatency",
          terms: [
            { var: "Time(Write)", desc: "OS execution time to write string payload to memory buffer." },
            { var: "Time(Flush)", desc: "OS execution time to flush memory buffer to physical disk." },
            { var: "MaxStepLatency", desc: "Maximum allowable overhead per TraCI step (default: 2.0ms)." }
          ],
          explanation: "Ensures simulation speed. By bypassing repetitive file-open/close syscalls and flushing directly to disk, logging overhead is kept under 2 milliseconds per step."
        }
      ],
      workflowSteps: [
        { step: "1. Stream Initialization", title: "Handle Creation", desc: "At simulation startup, opens preemption_events.txt with write permissions and writes header metadata." },
        { step: "2. Event Ingestion", title: "Payload Formatting", desc: "Receives step, mode, event_type, direction, and details from active simulation controllers." },
        { step: "3. Emoji Classification", title: "Visual Tagging", desc: "Maps event_type to visual emojis (e.g., 🚨 for EV_DETECTED, ⚠️ for INCIDENT_DETECTED, ⏳ for CROSS_PRIORITY)." },
        { step: "4. Stream Flushing", title: "Disk Commit", desc: "Writes formatted string directly to file_handle and invokes flush() to guarantee immediate disk persistence." },
        { step: "5. Stream Termination", title: "Cleanup", desc: "Upon simulation completion, safely closes the persistent file handle in the __del__ destructor." }
      ],
      traciInteractions: [
        "Passive Auditing Only: Receives TraCI state data passed down from controller classes; does not execute direct TraCI calls."
      ],
      edgeCases: [
        { title: "Disk Full / Write Exception", desc: "If the underlying physical disk runs out of storage, the logger catches IOError, suppresses further file writes, and falls back to console-only logging to prevent simulation crash." },
        { title: "Concurrent Multi-Process Logging", desc: "During parallel grid search optimization sweeps, each simulation worker is assigned a unique, sandboxed log file path to prevent write collisions." }
      ]
    }
  },
  {
    id: "data-collector",
    title: "Multi-Modal Telemetry & Lifecycle Delay Aggregation Subsystem",
    category: "telemetry",
    level: "L2",
    icon: "📊",
    badge: "Telemetry Aggregation",
    description: "The central data aggregation engine that captures micro-step TraCI metrics, tracking unique vehicle/pedestrian lifecycles, measuring time loss, and computing cumulative flow deltas.",
    mechanics: [
      "Unique Lifecycle Tracking: Maintains in-memory sets of unique vehicle and pedestrian IDs to capture absolute peak waiting times across individual trips.",
      "Time Loss & Stop Aggregation: Polls TraCI subscriptions to calculate total accumulated time loss (VAR_TIMELOSS) and count full vehicle stops (VAR_SPEED < 0.1m/s).",
      "Hidden Delta Capture: Tracks incremental step-by-step arrivals and exits across all fleet categories to feed highly accurate Cumulative Flow Diagrams (CFD)."
    ],
    keyComponents: [
      { name: "DataCollector", desc: "Main aggregation class that compiles micro-step metrics into historical time-series data points." },
      { name: "QueueCalculator", desc: "Static helper class that sums instantaneous halting vehicle counts across monitored approach lanes." }
    ],
    interdependencies: "Invoked every simulation step by SimulationManager; provides the primary data structures for dashboard charts.",
    fullDetails: {
      overview: "The Multi-Modal Telemetry & Lifecycle Delay Aggregation Subsystem acts as the central data nervous system of the simulation environment. Executing every simulation step, it ingests high-frequency TraCI subscription results. It goes beyond simple instantaneous queue counting by tracking the complete lifecycle of every unique vehicle and pedestrian. It records peak waiting times, accumulates total time loss, tracks vehicle stop frequencies, calculates congestion demand indices, and packages historical time-series data points for the React dashboard.",
      formulas: [
        {
          name: "Congestion Demand Index (I_cd)",
          math: "I_cd = min(1.0, QueueLength / max(10.0, ActiveApproachCount))",
          terms: [
            { var: "QueueLength", desc: "Active count of stopped vehicles on the approach." },
            { var: "ActiveApproachCount", desc: "Total count of active vehicles currently present on the approach corridor." }
          ],
          explanation: "Measures actual structural saturation. E.g., a queue of 5 cars is minor if 50 cars are flowing smoothly (I_cd = 0.1), but represents severe jamming if only 5 cars are on the approach and all are stopped (I_cd = 0.5)."
        },
        {
          name: "Vehicle Stop Frequency Condition",
          math: "StopCount += 1 IF Speed_current < 0.1 AND Speed_previous >= 0.1",
          terms: [
            { var: "Speed_current", desc: "Instantaneous vehicle speed (m/s) in the current simulation step." },
            { var: "Speed_previous", desc: "Cached vehicle speed (m/s) from the previous simulation step." }
          ],
          explanation: "Tracks stop-and-go driving. A vehicle is only flagged as stopping if it transitions from moving (>=0.1 m/s) to a complete halt (<0.1 m/s), preventing stopped vehicles from accumulating false stops every second."
        }
      ],
      workflowSteps: [
        { step: "1. Subscription Polling", title: "TraCI Ingestion", desc: "Every simulation step, ingests getAllSubscriptionResults for vehicles, persons, and lanes." },
        { step: "2. Unique ID Latching", title: "Lifecycle Tracking", desc: "Updates unique sets (unique_vehicles_seen, unique_peds_seen) and records peak waiting times per ID." },
        { step: "3. Stop & Loss Summation", title: "Efficiency Calculation", desc: "Evaluates vehicle speeds against 0.1m/s threshold and sums VAR_TIMELOSS across active fleets." },
        { step: "4. Delta Aggregation", title: "CFD Tracking", desc: "Calculates new arrivals and exits this step for Car, Truck, Bus, EV, and Pedestrian categories." },
        { step: "5. Payload Packaging", title: "Result Archiving", desc: "Compiles all metrics into a comprehensive dictionary point and appends it to results and history arrays." }
      ],
      traciInteractions: [
        "traci.vehicle.getAllSubscriptionResults(): Ingests batched vehicle telemetry (speed, waiting time, time loss, CO2).",
        "traci.person.getAllSubscriptionResults(): Ingests batched pedestrian waiting times and road positions."
      ],
      edgeCases: [
        { title: "TraCI Subscription Drop", desc: "If a vehicle departs the network mid-step, TraCI excludes it from subscription results. The collector safely retains its final latched peak waiting time in historical memory." },
        { title: "Zero Active Vehicles in Network", desc: "If the network empties completely, the collector clamps all floating-point averages (e.g., avg_time_loss, v_life_avg) to 0.0 to prevent division-by-zero exceptions." }
      ]
    }
  },
  {
    id: "qdr-tracker",
    title: "Dynamic Queue Dissipation Rate Engine",
    category: "analytics",
    level: "L3",
    icon: "⏱️",
    badge: "Discharge Tracking",
    description: "A specialized micro-step kinetic tracking engine that latches initial standing queues upon green transitions and computes instantaneous vehicle discharge speeds.",
    mechanics: [
      "Initial Queue Latching: Latches the exact standing queue count (start_queue) the microsecond a traffic light transitions to green.",
      "Live Rate Calculation: Continuously divides the reduction in queue length by elapsed green time to compute instantaneous discharge speeds (live_rate).",
      "Historical Rolling Average: Maintains a 5-cycle moving average of queue dissipation rates to establish baseline approach performance."
    ],
    keyComponents: [
      { name: "QDRTracker", desc: "Main tracking class managing active queue latches and historical discharge arrays." },
      { name: "QueueCalculator", desc: "Static helper class invoked to measure instantaneous approach queue lengths." }
    ],
    interdependencies: "Directly feeds the Stretch Logic and Predictive Platoon 'Perfect Green' subsystems.",
    fullDetails: {
      overview: "The Dynamic Queue Dissipation Rate Engine acts as the kinetic speedometer of the intersection stop line. Operating at the micro-step level, it monitors the exact standing queue when a light turns green. As vehicles accelerate and cross the stop line, it continuously calculates the Queue Dissipation Rate (QDR)—the speed at which the queue shrinks. This active rate is broadcast to the Stretch Logic and Predictive Platoon subsystems to dynamically modulate phase boundaries.",
      formulas: [
        {
          name: "Instantaneous QDR (QDR_live)",
          math: "QDR_live = max(0.0, (StartQueue - CurrentQueue) / ElapsedGreenTime)",
          terms: [
            { var: "StartQueue", desc: "Exact count of stopped vehicles latched at the start of the green phase." },
            { var: "CurrentQueue", desc: "Instantaneous count of stopped vehicles remaining on the approach." },
            { var: "ElapsedGreenTime", desc: "Active green duration (seconds) elapsed since phase transition." }
          ],
          explanation: "Calculates live clearing speed. E.g., if a queue starts at 20 cars and drops to 10 cars after 5 seconds of green, QDR_live is (20 - 10) / 5 = 2.0 vehicles per second."
        },
        {
          name: "Historical Moving Average (QDR_ma)",
          math: "QDR_ma = Sum(QDR_data[-5:]) / min(5, len(QDR_data))",
          terms: [
            { var: "QDR_data", desc: "Historical array of finalized queue dissipation rates recorded across previous green cycles." }
          ],
          explanation: "Establishes baseline approach efficiency. A 5-cycle moving average smooths out temporary anomalies (e.g., a stalled truck) to provide a stable benchmark for incident detection."
        }
      ],
      workflowSteps: [
        { step: "1. Phase Transition Monitoring", title: "State Polling", desc: "Monitors active green directions (ns_is_g, ew_is_g) every simulation step." },
        { step: "2. Queue Latching", title: "Snapshot Capture", desc: "Upon detecting a new green direction, latches start_step and start_queue via QueueCalculator." },
        { step: "3. Live Rate Tracking", title: "Speed Calculation", desc: "During active green, continuously updates live_rate based on shrinking queue length." },
        { step: "4. Cycle Termination", title: "Data Commit", desc: "When green ends or queue reaches 0, commits the final calculated rate to the qdr_data historical array." },
        { step: "5. Statistics Broadcast", title: "API Serving", desc: "Serves avg, recent, and moving_avg QDR metrics to requesting controller subsystems." }
      ],
      traciInteractions: [
        "Queue Calculation Only: Relies on pre-polled TraCI lane halting counts passed down from DataCollector."
      ],
      edgeCases: [
        { title: "Mid-Phase Platoon Arrival", desc: "If a secondary platoon arrives while the initial queue is clearing, CurrentQueue may temporarily increase. The engine clamps QDR_live to 0.0 to prevent negative discharge rates." },
        { title: "Zero Standing Queue on Green", desc: "If a light turns green with zero stopped vehicles, the engine bypasses live rate calculations and returns the historical QDR_ma." }
      ]
    }
  },
  {
    id: "duration-tracker",
    title: "Phase Duration & Starvation Latching Engine",
    category: "analytics",
    level: "L3",
    icon: "⏳",
    badge: "Duration Tracking",
    description: "A dedicated temporal tracking engine that monitors continuous green active durations and red waiting durations, latching peak starvation limits to trigger spillback overrides.",
    mechanics: [
      "Active Green Tracking: Increments active green phase timers every simulation step to enforce maximum green ceilings.",
      "Red Starvation Latching: Tracks continuous red waiting steps across stopped approaches, latching absolute peak starvation durations.",
      "Zero-Latency State Reset: Instantly resets active timers to zero upon detecting a phase transition, ensuring flawless cycle boundary tracking."
    ],
    keyComponents: [
      { name: "DurationTracker", desc: "Main tracking class managing green active and red waiting duration dictionaries." }
    ],
    interdependencies: "Directly feeds StarvationMonitor and Dynamic Red spillback prevention guardrails.",
    fullDetails: {
      overview: "The Phase Duration & Starvation Latching Engine acts as the temporal memory bank of the intersection controllers. Operating independently of TraCI's internal phase timers, it tracks the exact number of continuous simulation steps an approach has experienced green or red. It latches peak red waiting durations (`max`) to provide the foundational telemetry required by the StarvationMonitor to trigger emergency phase handoffs.",
      formulas: [
        {
          name: "Red Starvation Latch Condition",
          math: "RedMax = max(RedMax, RedCurrent) IF Phase transitioned from Red to Green",
          terms: [
            { var: "RedMax", desc: "Absolute peak continuous red waiting time observed on the approach." },
            { var: "RedCurrent", desc: "Active count of continuous red waiting steps accumulated during the current cycle." }
          ],
          explanation: "Latches peak starvation debt. When a street finally receives green, its accumulated red waiting time is latched into RedMax to evaluate long-term fairness."
        }
      ],
      workflowSteps: [
        { step: "1. State Ingestion", title: "Signal Polling", desc: "Receives boolean green states (ns_is_g, ew_is_g) every simulation step." },
        { step: "2. Green Increment", title: "Active Timer", desc: "If an approach is green, increments green.current and resets red.current to 0." },
        { step: "3. Red Increment", title: "Starvation Timer", desc: "If an approach is red, increments red.current and resets green.current to 0." },
        { step: "4. Peak Latching", title: "Max Update", desc: "Continuously updates green.max and red.max against active current timers." },
        { step: "5. Telemetry Broadcast", title: "Guardrail Serving", desc: "Exposes get_durations(), get_red_time(), and get_green_time() to active safety monitors." }
      ],
      traciInteractions: [
        "Logic Tracking Only: Operates purely in local Python memory; does not execute TraCI calls."
      ],
      edgeCases: [
        { title: "Yellow Amber Transition Windows", desc: "During yellow amber clearance intervals, both NS and EW green states evaluate to False. The tracker correctly increments red timers for all approaches during the clearance window." },
        { title: "Manual Phase Override", desc: "If a user forces a phase switch via the Control Hub UI, the tracker instantly latches active durations and resets current timers without requiring a full cycle completion." }
      ]
    }
  },
  {
    id: "simulation-manager",
    title: "Master Simulation Lifecycle & Multi-Threaded TraCI Orchestrator",
    category: "execution",
    level: "L1",
    icon: "🕹️",
    badge: "Master Orchestration",
    description: "_The central executive orchestrator that initializes TraCI instances, manages object pooling, coordinates micro-step execution loops, and enforces physical collision tracking._",
    mechanics: [
      "TraCI Lifecycle Management: Initializes and terminates TraCI/sumo-gui binary instances, automatically configuring high-DPI GUI view settings and camera rotations.",
      "Entity Object Pooling: Pre-allocates memory pools for vehicle and pedestrian IDs to eliminate object instantiation overhead during high-frequency stream injection.",
      "Micro-Step Execution Loop: Coordinates the sequential micro-step execution of PrioritySystem, PedestrianHandler, AdaptiveController, and StarvationMonitor."
    ],
    keyComponents: [
      { name: "SimulationManager", desc: "Master executive class managing the TraCI binary lifecycle and the main simulation step loop." },
      { name: "TrafficLightSetup", desc: "Dynamic phase mapping class that inspects active TLS programs to identify green/yellow phase indices." }
    ],
    interdependencies: "Orchestrates all active simulation subsystems, trackers, loggers, and controllers.",
    fullDetails: {
      overview: "The Master Simulation Lifecycle & Multi-Threaded TraCI Orchestrator acts as the central executive governor of the entire traffic simulation ecosystem. It bridges the Python backend with the underlying C++ SUMO binary. It handles the complete lifecycle of TraCI connections, manages memory-efficient object pools for stream traffic injection, maps traffic light phases dynamically, coordinates the micro-step execution loop across all active control subsystems, and tracks physical collision events.",
      formulas: [
        {
          name: "Micro-Step Execution Budget (T_step)",
          math: "T_step = T_traci + T_priority + T_ped + T_adaptive + T_collector < 100ms",
          terms: [
            { var: "T_traci", desc: "Execution time for TraCI subscription polling and simulationStep() advancement." },
            { var: "T_priority / T_ped / T_adaptive", desc: "Execution times for active control subsystem decision loops." },
            { var: "T_collector", desc: "Execution time for DataCollector metric aggregation." }
          ],
          explanation: "Enforces micro-step execution constraints. The entire micro-step decision and logging pipeline must complete in under 100 milliseconds to maintain smooth simulation pacing."
        }
      ],
      workflowSteps: [
        { step: "1. Binary Initialization", title: "TraCI Start", desc: "Invokes traci.start() with configured sumocfg paths and GUI view settings." },
        { step: "2. Subsystem Wiring", title: "Object Instantiation", desc: "Instantiates DataCollector, PhaseTracker, StarvationMonitor, and AdaptiveController." },
        { step: "3. Dynamic Mapping", title: "Phase Discovery", desc: "Uses TrafficLightSetup to inspect active TLS programs and latch NS, EW, and Ped phase indices." },
        { step: "4. Micro-Step Loop", title: "Step Execution", desc: "Executes the main simulation loop: polls subscriptions, evaluates preemption/adaptive actions, advances traci.simulationStep(), and collects metrics." },
        { step: "5. Binary Termination", title: "TraCI Close", desc: "Safely closes the TraCI connection and invokes emission/logger destructors upon reaching sim_time." }
      ],
      traciInteractions: [
        "traci.start() / traci.close(): Manages the core binary execution lifecycle.",
        "traci.simulationStep(): Advances the underlying C++ simulation engine by one micro-step.",
        "traci.simulation.getCollisions(): Extracts physical collision telemetry between vehicles and pedestrians."
      ],
      edgeCases: [
        { title: "TraCI Socket Disconnection / Crash", desc: "If the SUMO binary crashes unexpectedly (e.g., out of memory), the manager catches TraCIException, logs a fatal error, and safely flushes all collected telemetry before exiting." },
        { title: "Dynamic GUI Camera Rotation", desc: "If gui_rotate_deg is configured, the manager invokes traci.gui.setAngle() to dynamically rotate the simulation viewport during active execution." }
      ]
    }
  },
  {
    id: "rapid-grid-search",
    title: "Multi-Goal Hyperparameter Grid Search & Candidate Arbitration Subsystem",
    category: "analytics",
    level: "L2",
    icon: "🔬",
    badge: "Grid Search Engine",
    description: "An ultra-fast hyperparameter optimization engine that executes parallel multi-stage grid sweeps, employing Latin Hypercube sampling, candidate clustering, and goal-specific weight arbitration.",
    mechanics: [
      "Parallel Multi-Stage Execution: Orchestrates independent optimization stages (Priority, Adaptive, EV Preemption, Meta) in parallel worker threads.",
      "Candidate Clustering Diversity: Applies greedy distance clustering to candidate parameter profiles, filtering out redundant configurations to maximize search diversity.",
      "Coarse-Binned Metric Caching: Caches simulation results using binned metric keys (e.g., 3s EV delay buckets) to instantly return scores for identical performance profiles."
    ],
    keyComponents: [
      { name: "RapidGridSearch", desc: "Main optimization orchestration module managing candidate generation, filtering, and parallel execution." },
      { name: "ScoreKey / IsBetter", desc: "Arbitration helper functions that rank candidates based on objective scores and strict constraint guardrails." }
    ],
    interdependencies: "Invokes SimulationManager across parallel worker threads; outputs the optimized system_param_config.json.",
    fullDetails: {
      overview: "The Multi-Goal Hyperparameter Grid Search & Candidate Arbitration Subsystem acts as the automated AI tuning engine of the Control Hub. When a user triggers an optimization sweep for a specific goal (e.g., Eco, Throughput, Low Congestion), this subsystem conducts an ultra-fast grid search. It uses Latin Hypercube sampling for intelligent candidate generation, enforces diversity via candidate clustering, filters out high-risk configs using strict safety bounds, executes parallel simulation runs, and arbitrates winning profiles using goal-specific weight multipliers.",
      formulas: [
        {
          name: "Unified Objective Score (S_obj)",
          math: "S_obj = Sum(Weight_m × Multiplier_goal × Ratio(Metric_actual, Metric_baseline))",
          terms: [
            { var: "Weight_m", desc: "Base mathematical weight assigned to performance metric m (e.g., all_v_avg=5.0, starvation=4.0)." },
            { var: "Multiplier_goal", desc: "Goal-specific weight multiplier defined in GOAL_MULTIPLIERS (e.g., Eco CO2=25.0)." },
            { var: "Ratio", desc: "Normalized performance ratio (Actual / Baseline). Lower is better." }
          ],
          explanation: "The master arbitration formula. By multiplying base weights with goal-specific focus multipliers and evaluating normalized baseline ratios, the engine calculates a single unified score to rank competing candidate profiles."
        },
        {
          name: "Coarse Metric Cache Key",
          math: "CacheKey = Bin(EV_P95, 3s) + Bin(Ped_P95, 5s) + Bin(Starvation, 1) + Bin(CO2, 500g)",
          terms: [
            { var: "Bin", desc: "Rounding function that bins continuous metrics into coarse discrete buckets." }
          ],
          explanation: "Drastically accelerates search sweeps. If a new candidate profile yields simulation metrics that fall into the exact same coarse buckets as a previously simulated config, the engine bypasses redundant TraCI execution and reuses the cached score."
        }
      ],
      workflowSteps: [
        { step: "1. Stage Initialization", title: "Candidate Synthesis", desc: "Generates hyperparameter candidate pools for Priority, Adaptive, EV, and Meta stages using Latin Hypercube sampling." },
        { step: "2. Constraint Pre-Filtering", title: "Safety Bounding", desc: "Filters candidate pools against SAFE_GUARD_BOUNDS to eliminate configurations that risk severe starvation or gridlock." },
        { step: "3. Diversity Clustering", title: "Clustering Sweep", desc: "Passes remaining candidates through _cluster_candidates to select a highly diverse representative subset." },
        { step: "4. Parallel Execution", title: "Simulation Sweep", desc: "Executes _run_main_with_meta_candidates across parallel ThreadPoolExecutor workers, tracking progress via console bars." },
        { step: "5. Winner Arbitration", title: "Profile Commit", desc: "Evaluates candidates using _score_key, selects the apex winner, and applies _apply_profile_to_config to save system_param_config.json." }
      ],
      traciInteractions: [
        "Subprocess Orchestration Only: Spawns parallel Python worker processes executing SimulationManager; does not use direct TraCI calls."
      ],
      edgeCases: [
        { title: "All Candidates Violate Constraints", desc: "If an aggressive goal (e.g., zero stops) causes all candidates to fail strict guardrail checks, the engine automatically relaxes constraint thresholds by 15% and initiates a secondary fallback sweep." },
        { title: "Parallel Cache Write Collision", desc: "Uses atomic file locks and PID-hashed temporary files when updating .rapid_grid_cache.json to prevent race conditions across parallel worker threads." }
      ]
    }
  },
  {
    id: "fastapi-orchestrator",
    title: "REST API Bridge & Next.js Telemetry Ingestion Layer",
    category: "telemetry",
    level: "L1",
    icon: "🔌",
    badge: "API Orchestration",
    description: "The high-performance REST API backend that connects Next.js frontend components with underlying simulation data directories, providing robust regex-based fallback metrics.",
    mechanics: [
      "Asynchronous Endpoint Serving: Exposes high-performance REST endpoints (/api/dashboard-data, /api/override) to serve dynamic simulation analytics to the React dashboard.",
      "Regex Route Parsing Fallback: Scans underlying SUMO XML route files using regex extraction to compute total spawned vehicle and pedestrian counts when summary JSONs are unavailable.",
      "Cloud Action Bridging: Provides direct pass-through execution for MongoDB Atlas cloud operations (fetch, download, delete, export) triggered from the Control Hub UI."
    ],
    keyComponents: [
      { name: "FastAPI App", desc: "Main Uvicorn-powered REST application managing CORS middleware and endpoint routing." },
      { name: "XMLRegexParser", desc: "Standalone helper module that parses SUMO .rou.xml files to extract vehicle type distributions." }
    ],
    interdependencies: "Bridges the Next.js frontend with the local sys_output/dashboard_data/ directory and MongoDB cloud utilities.",
    fullDetails: {
      overview: "The REST API Bridge & Next.js Telemetry Ingestion Layer acts as the vital communication bridge between the Next.js frontend dashboard and the Python simulation backend. Powered by FastAPI and Uvicorn, it serves dynamic simulation summaries, historical charts, and network layout schemas. Crucially, it implements robust regex-based XML parsing: if a simulation is actively running and summary JSON files are not yet fully compiled, this layer parses underlying SUMO route XML files directly to ensure the dashboard's Section 1 overview cards always display valid vehicle fleet and pedestrian counts.",
      formulas: [
        {
          name: "Regex Flow Estimation (E_flow)",
          math: "E_flow = max(0, round((End - Begin) × Probability)) OR max(0, round((End - Begin) / Period))",
          terms: [
            { var: "Begin / End", desc: "Temporal boundaries (seconds) extracted from XML <flow> attributes." },
            { var: "Probability / Period", desc: "Spawn probability or repetition period extracted from XML attributes." }
          ],
          explanation: "Calculates trip counts directly from XML definitions. E.g., a flow active from step 0 to 1200 with probability 0.3 is estimated to generate exactly 1200 × 0.3 = 360 vehicle trips."
        }
      ],
      workflowSteps: [
        { step: "1. Endpoint Invocation", title: "HTTP GET/POST", desc: "Receives requests from Next.js frontend components via configured CORS middleware." },
        { step: "2. Folder Resolution", title: "Latest Run Lookup", desc: "Scans sys_output/dashboard_data/latest.json to identify the active simulation output directory." },
        { step: "3. JSON Ingestion", title: "Summary Loading", desc: "Reads summary.json, history.json, and history_by_mode.json to package dashboard chart payloads." },
        { step: "4. Fallback Parsing", title: "XML Regex Scan", desc: "If JSON summaries are missing, executes regex scans across routes.rou.xml and flows.rou.xml to calculate Section 1 totals." },
        { step: "5. Response Formatting", title: "Payload Transmission", desc: "Returns a unified, strongly-typed JSON response containing timestamp metadata, Section 1 counts, and historical chart arrays." }
      ],
      traciInteractions: [
        "REST API Serving Only: Operates purely as an HTTP web server and file parser; does not execute TraCI calls."
      ],
      edgeCases: [
        { title: "Missing Dashboard Data Directory", desc: "If the user launches the dashboard before running any simulations, the API catches FileNotFoundError and returns a structured error payload instructing the frontend to render a helpful 'Run Simulation' prompt." },
        { title: "Malformed XML Route Files", desc: "If underlying SUMO XML files are corrupted or incomplete, the regex parser safely bypasses malformed tags and returns partial counts without crashing the API endpoint." }
      ]
    }
  },
  {
    id: "cli-entrypoint",
    title: "CLI Entrypoint & Scenario Execution Wrapper",
    category: "execution",
    level: "L1",
    icon: "🖥️",
    badge: "CLI Orchestration",
    description: "The primary command-line execution gateway that parses terminal arguments, resolves configuration file cascades, orchestrates multi-scenario controller sweeps, and manages baseline caching.",
    mechanics: [
      "Terminal Argument Parsing: Ingests CLI flags (--mode, --sim-time, --benchmark-mode, --early-stop) to dynamically configure simulation behavior and override JSON defaults.",
      "Configuration Cascade Resolution: Merges network_layout_config.json, system_param_config.json, and optimization_config.json into a unified execution dictionary.",
      "Multi-Scenario Orchestration: Sequentially executes the 6 core baseline and adaptive controller scenarios, managing pristine state isolation between runs.",
      "Baseline Result Caching: Caches completed baseline runs in .baseline_cache.json to bypass redundant TraCI execution during subsequent optimization sweeps."
    ],
    keyComponents: [
      { name: "main()", desc: "Core CLI entrypoint function managing argument parsing and scenario looping." },
      { name: "_build_light_timing_summary()", desc: "Helper function that compiles green/yellow/red phase duration statistics from historical logs." }
    ],
    interdependencies: "Invokes NetworkManager, SimulationManager, and path/config utilities.",
    fullDetails: {
      overview: "The CLI Entrypoint & Scenario Execution Wrapper (`main.py`) acts as the master execution gateway of the entire simulation suite. Whether triggered by a developer in the terminal or by the FastAPI backend during an automated sweep, this layer handles the complete setup. It parses command-line arguments, merges the configuration file cascade, establishes pristine execution sandboxes for each controller mode, manages baseline caching, and formats the final dashboard export payloads.",
      formulas: [
        {
          name: "Cache Hit Verification (C_hit)",
          math: "C_hit = True IF ScenarioName IN HorizonCache AND SimTime == CachedHorizon",
          terms: [
            { var: "HorizonCache", desc: "In-memory dictionary loaded from .baseline_cache.json." },
            { var: "SimTime", desc: "Active simulation horizon (seconds)." }
          ],
          explanation: "Drastically accelerates multi-goal matrix sweeps. If a baseline scenario (e.g., fixed_no_preempt) has already been simulated for the requested horizon, the entrypoint loads the full telemetry directly from disk, saving minutes of compute."
        }
      ],
      workflowSteps: [
        { step: "1. CLI Ingestion", title: "Flag Parsing", desc: "Parses sys.argv using argparse to extract mode, sim_time, gui rotation, and benchmark flags." },
        { step: "2. Config Cascade", title: "JSON Merging", desc: "Sequentially loads and merges network layout, system parameters, and optimization profiles." },
        { step: "3. Directory Setup", title: "Sandbox Isolation", desc: "Creates timestamped export directories under sys_output/dashboard_data/ and seeds latest.json." },
        { step: "4. Scenario Looping", title: "Sequential Execution", desc: "Iterates through configured scenarios, instantiating SimulationManager with deep-copied configs." },
        { step: "5. Dashboard Export", title: "Payload Commit", desc: "Compiles all_results, all_histories, and lifecycle stats into summary.json and history_by_mode.json." }
      ],
      traciInteractions: [
        "Subprocess / CLI Management Only: Orchestrates high-level Python classes; does not execute direct TraCI calls."
      ],
      edgeCases: [
        { title: "Corrupted Baseline Cache File", desc: "If .baseline_cache.json is corrupted or malformed, the wrapper catches JSONDecodeError, deletes the corrupted cache file, and initiates a fresh simulation sweep." },
        { title: "Missing Configuration Files", desc: "If any JSON config file is missing from input_data/sys_config/, the wrapper logs a non-fatal warning and relies on hardcoded internal defaults." }
      ]
    }
  },
  {
    id: "config-validator",
    title: "Configuration Cascade & Schema Validator",
    category: "execution",
    level: "L3",
    icon: "⚙️",
    badge: "Schema Validation",
    description: "A robust dictionary merging and validation utility that enforces schema integrity across nested configuration objects, ensuring critical fallback defaults are preserved during dynamic updates.",
    mechanics: [
      "Deep Dictionary Merging: Recursively traverses and updates nested configuration dictionaries rather than performing shallow top-level overwrites.",
      "Schema Default Enforcement: Inspects incoming configuration profiles to ensure mandatory sub-keys (e.g., switch_stabilization_s, dynamic_max_red) are fully populated.",
      "Type Normalization: Sanitizes and casts incoming configuration values (e.g., converting string timestamps to floats or enforcing boolean flags) to prevent runtime type exceptions."
    ],
    keyComponents: [
      { name: "config_utils.py", desc: "Standalone utility module containing recursive update and validation logic." }
    ],
    interdependencies: "Invoked by main.py, RapidGridSearch, and SimulationManager.",
    fullDetails: {
      overview: "The Configuration Cascade & Schema Validator (`config_utils.py`) acts as the defensive guardrail of the simulation's parameter ecosystem. In complex optimization sweeps, partial tuning profiles often contain only a subset of modified hyperparameters. If applied naively using Python's standard `dict.update()`, entire nested structures (like `volume_profiles` or `fairness_logic`) can be accidentally wiped out. This utility solves this by performing deep recursive merging and enforcing strict schema defaults.",
      formulas: [
        {
          name: "Recursive Merge Logic (M_deep)",
          math: "Target[K] = RecursiveMerge(Target[K], Source[K]) IF K IN Target AND K is Dict",
          terms: [
            { var: "Target", desc: "The foundational system configuration dictionary containing all default values." },
            { var: "Source", desc: "The incoming partial tuning profile containing optimized hyperparameter overrides." }
          ],
          explanation: "Preserves nested configuration trees. E.g., if Source only updates adaptive_control.min_green_s, the recursive merge ensures that adaptive_control.max_green_s and adaptive_control.volume_profiles remain perfectly intact."
        }
      ],
      workflowSteps: [
        { step: "1. Profile Ingestion", title: "Dictionary Loading", desc: "Receives base configuration dictionary and incoming update profile." },
        { step: "2. Key Traversal", title: "Recursive Scan", desc: "Iterates through all key-value pairs in the incoming update profile." },
        { step: "3. Type Inspection", title: "Dictionary Check", desc: "If a value is a dictionary, inspects the target dictionary to determine if a recursive merge is required." },
        { step: "4. Default Injection", title: "Fallback Seeding", desc: "Scans the merged dictionary against a master schema template to inject missing mandatory sub-keys." },
        { step: "5. Sanitized Return", title: "Profile Export", desc: "Returns a fully validated, deeply merged configuration dictionary ready for controller consumption." }
      ],
      traciInteractions: [
        "Data Structure Management Only: Operates purely on Python dictionaries; does not execute TraCI calls."
      ],
      edgeCases: [
        { title: "Type Mismatch Overwrite", desc: "If an incoming profile attempts to overwrite a dictionary with a scalar value (e.g., setting adaptive_control = 50), the validator catches the type mismatch, rejects the override, and retains the original dictionary structure." },
        { title: "Empty Profile Update", desc: "If an empty update dictionary {} is passed, the validator safely returns a deep copy of the original target configuration." }
      ]
    }
  },
  {
    id: "path-resolver",
    title: "Dynamic Environment Path Resolver",
    category: "execution",
    level: "L3",
    icon: "🗂️",
    badge: "Path Resolution",
    description: "The foundational filesystem utility that dynamically resolves absolute workspace roots, manages temporary SUMO configuration sandboxes, and isolates simulation output directories across diverse OS environments.",
    mechanics: [
      "Absolute Root Resolution: Dynamically climbs the directory tree from __file__ to establish the absolute repository root path, ensuring seamless execution across Linux, macOS, and Windows.",
      "Sandbox Directory Management: Creates and isolates temporary execution directories (e.g., sumo_config) to sandbox generated XML files during parallel runs.",
      "Output Directory Isolation: Resolves structured output paths under sys_output/ to organize simulation logs, dashboard data, and optimization caches."
    ],
    keyComponents: [
      { name: "path_utils.py", desc: "Utility module providing get_workspace_root, get_sumo_config_dir, and get_sys_output_dir functions." }
    ],
    interdependencies: "Imported by virtually every backend script, CLI tool, and FastAPI endpoint.",
    fullDetails: {
      overview: "The Dynamic Environment Path Resolver (`path_utils.py`) acts as the filesystem anchor of the traffic control suite. Because the suite is executed across diverse environments—from local Linux workstations to containerized cloud servers—hardcoded relative paths (like `../../input_data`) inevitably cause `FileNotFoundError` crashes. This utility solves this by dynamically establishing absolute root paths at runtime and providing clean, sandboxed directory access for all configuration and output files.",
      formulas: [
        {
          name: "Workspace Root Resolution (P_root)",
          math: "P_root = ParentDir(ParentDir(AbsolutePath(__file__)))",
          terms: [
            { var: "__file__", desc: "The absolute path of the calling script within the codebase." }
          ],
          explanation: "Establishes an absolute anchor point. Regardless of the current working directory (CWD) from which a user executes a script, P_root reliably points to the base repository folder (e.g., /home/erfan/sumo-deploy)."
        }
      ],
      workflowSteps: [
        { step: "1. Anchor Calculation", title: "Path Climbing", desc: "Resolves absolute path of path_utils.py and climbs two levels to latch the workspace root." },
        { step: "2. Config Pathing", title: "Sandbox Resolution", desc: "Appends 'sumo_config' to the root path to provide a dedicated folder for generated XML files." },
        { step: "3. Output Pathing", title: "Log Directory Resolution", desc: "Appends 'sys_output' to the root path to establish the base directory for simulation results." },
        { step: "4. Directory Verification", title: "Folder Creation", desc: "Validates existence of target directories, automatically creating missing parent folders if required." },
        { step: "5. Path Export", title: "String Return", desc: "Returns fully qualified, absolute file paths to requesting backend modules." }
      ],
      traciInteractions: [
        "Filesystem Utility Only: Operates purely on OS file paths; does not execute TraCI calls."
      ],
      edgeCases: [
        { title: "Permission Denied on Folder Creation", desc: "If the OS restricts write permissions in the target directory, the resolver catches PermissionError and attempts to resolve a fallback path inside the user's local /tmp/ directory." },
        { title: "Symlink Directory Traversal", desc: "Uses os.path.realpath() to fully resolve symbolic links, preventing pathing errors in complex virtualized environments." }
      ]
    }
  },
  {
    id: "json-engine",
    title: "Atomic JSON I/O & Serialization Engine",
    category: "telemetry",
    level: "L3",
    icon: "📦",
    badge: "Atomic I/O",
    description: "A highly resilient data serialization utility that manages robust file locking, custom datetime serialization, and atomic read/write operations for high-frequency dashboard telemetry files.",
    mechanics: [
      "Atomic File Writes: Writes JSON payloads to temporary files before atomically renaming them to the target filename, eliminating the risk of corrupted files if a process crashes mid-write.",
      "Custom Datetime Serialization: Intercepts datetime objects during JSON encoding, automatically converting them to standardized ISO-8601 timestamp strings.",
      "Robust File Locking: Implements cross-platform file locking mechanisms to prevent read/write collisions when multiple FastAPI workers access dashboard data simultaneously."
    ],
    keyComponents: [
      { name: "json_utils.py", desc: "Utility module providing robust JSON loading, atomic saving, and custom encoders." }
    ],
    interdependencies: "Invoked by main.py, FastAPI orchestrator, and DataCollector.",
    fullDetails: {
      overview: "The Atomic JSON I/O & Serialization Engine (`json_utils.py`) acts as the data persistence safety net of the dashboard ecosystem. When high-frequency simulation runs export large telemetry payloads to `summary.json` or `history.json`, concurrent reads by the Next.js frontend or FastAPI backend can encounter partially written, corrupted files. This utility solves this by enforcing atomic write operations (write-to-temp, then rename) and providing custom serialization for complex Python objects.",
      formulas: [
        {
          name: "Atomic Write Transaction (T_atomic)",
          math: "Write(TempFile, Payload) -> Flush() -> OS_Rename(TempFile, TargetFile)",
          terms: [
            { var: "TempFile", desc: "A temporary file created in the same filesystem directory (e.g., summary.json.tmp)." },
            { var: "TargetFile", desc: "The final destination filename (e.g., summary.json)." }
          ],
          explanation: "Guarantees zero file corruption. Because OS-level file renaming is atomic, external readers either see the complete old file or the complete new file, completely eliminating JSON parse errors."
        }
      ],
      workflowSteps: [
        { step: "1. Payload Ingestion", title: "Data Preparation", desc: "Receives Python dictionary payload and target file path." },
        { step: "2. Temp Instantiation", title: "Temp File Creation", desc: "Generates a unique temporary filename in the target directory using process ID hashing." },
        { step: "3. Serialization", title: "JSON Encoding", desc: "Encodes payload to string, passing custom _serialize_datetime helper to handle timestamp objects." },
        { step: "4. Disk Commit", title: "Temp Flush", desc: "Writes encoded string to the temporary file and invokes flush() to ensure physical disk write." },
        { step: "5. Atomic Rename", title: "File Replacement", desc: "Executes os.replace() to atomically overwrite the target file with the temporary file." }
      ],
      traciInteractions: [
        "Disk I/O Utility Only: Operates purely on OS file handles; does not execute TraCI calls."
      ],
      edgeCases: [
        { title: "Concurrent Rename Collision", desc: "In Windows environments, os.replace() can occasionally fail if another process is actively reading the target file. The engine catches PermissionError and implements a short exponential backoff retry loop." },
        { title: "Unserializable Object Encounter", desc: "If the payload contains custom Python classes or un-cast numpy arrays, the custom encoder intercepts them, converts them to standard dictionaries or lists, and resumes serialization." }
      ]
    }
  },
  {
    id: "tls-setup",
    title: "Dynamic TLS Phase Discovery Engine",
    category: "core",
    level: "L3",
    icon: "🚦",
    badge: "Phase Discovery",
    description: "An advanced runtime inspection engine that queries active TraCI traffic light programs to dynamically identify green, yellow, and red phase indices across arbitrary intersection topologies.",
    mechanics: [
      "Runtime Program Inspection: Queries traci.trafficlight.getCompleteRedYellowGreenDefinition() at simulation startup to inspect active phase definitions.",
      "Automated Directional Mapping: Scans phase state strings (e.g., 'GGGrrrGGGrrr') to dynamically latch which phase indices correspond to North-South versus East-West movements.",
      "Pedestrian Phase Discovery: Identifies dedicated all-red pedestrian scramble phases or concurrent walk intervals to wire up the PedestrianHandler."
    ],
    keyComponents: [
      { name: "TrafficLightSetup", desc: "Main discovery class managing TLS program parsing and phase index latching." }
    ],
    interdependencies: "Invoked by SimulationManager at startup; provides phase indices to PhaseTracker and AdaptiveController.",
    fullDetails: {
      overview: "The Dynamic TLS Phase Discovery Engine (`TrafficLightSetup`) acts as the structural decoder of the intersection's traffic lights. In customizable SUMO networks, traffic light programs can vary wildly—some have 4 phases, others have 8, and phase order can change depending on user-defined turn pockets. Hardcoding phase indices (e.g., assuming Phase 0 is always North-South green) leads to catastrophic controller failures. This engine solves this by inspecting the active TraCI TLS program at runtime and dynamically discovering the exact phase mapping.",
      formulas: [
        {
          name: "Directional Phase Identification (P_dir)",
          math: "IsNorthSouth = True IF Count('G', StateString[0:3]) > 0 ELSE IsEastWest = True",
          terms: [
            { var: "StateString", desc: "The TraCI phase definition string (e.g., 'GGGggrrrrGGGggrrrr')." }
          ],
          explanation: "Decodes signal states. By analyzing which specific lane indices receive 'G' (Green) in each phase string, the engine automatically maps phase numbers to physical street directions."
        }
      ],
      workflowSteps: [
        { step: "1. TLS Query", title: "Program Fetching", desc: "Queries traci.trafficlight.getCompleteRedYellowGreenDefinition(tlsID) at simulation step 0." },
        { step: "2. Phase Iteration", title: "String Scanning", desc: "Iterates through all returned phase objects, extracting duration and state string attributes." },
        { step: "3. Movement Mapping", title: "Index Latching", desc: "Identifies primary Green phases for NS and EW directions, latching their exact integer indices." },
        { step: "4. Amber Mapping", title: "Yellow Latching", desc: "Identifies intermediate Yellow amber clearance phases following each primary green phase." },
        { step: "5. Controller Wiring", title: "State Broadcast", desc: "Exposes latched phase indices (ns_green_idx, ew_green_idx, ped_idx) to active simulation controllers." }
      ],
      traciInteractions: [
        "traci.trafficlight.getCompleteRedYellowGreenDefinition(tlsID): Retrieves the complete multi-phase program definition from the SUMO binary.",
        "traci.trafficlight.setProgram(tlsID, programID): Ensures the active program matches the user's configured controller mode."
      ],
      edgeCases: [
        { title: "Non-Standard Phase Structures", desc: "If an intersection features complex leading pedestrian intervals (LPI) or transit-only phases, the engine parses state strings for lowercase 'g' (priority yield) and 's' (scramble) characters to establish proper mapping." },
        { title: "Single-Phase / Corrupted Definitions", desc: "If the TLS definition contains only a single flashing yellow phase, the engine logs a structural warning and injects a standard 4-phase fallback program." }
      ]
    }
  },
  {
    id: "phase-tracker",
    title: "Phase Transition State Machine",
    category: "core",
    level: "L3",
    icon: "🔄",
    badge: "State Machine",
    description: "A robust state machine that maintains active phase states, tracks elapsed phase seconds, enforces minimum green stabilization windows, and coordinates yellow amber clearance intervals.",
    mechanics: [
      "Active State Maintenance: Tracks the current active phase index, elapsed green time, and active clearance states throughout the simulation lifecycle.",
      "Stabilization Window Enforcement: Enforces switch_stabilization_s (minimum green) to prevent rapid, erratic phase toggling during fluctuating traffic demand.",
      "Amber Clearance Coordination: Manages intermediate yellow clearance intervals, ensuring safe vehicle deceleration before granting green to conflicting approaches."
    ],
    keyComponents: [
      { name: "PhaseTracker", desc: "Main state machine class managing phase timers, transition flags, and clearance intervals." }
    ],
    interdependencies: "Invoked every simulation step by SimulationManager; acts as the direct actuator for AdaptiveController.",
    fullDetails: {
      overview: "The Phase Transition State Machine (`PhaseTracker`) acts as the operational gearbox of the intersection controller. While the `AdaptiveController` evaluates high-level demand to decide *when* a phase switch is desired, it cannot execute the switch directly without violating safety constraints. This state machine takes the switch request, verifies that minimum green stabilization windows have been met, initiates the yellow amber clearance phase, holds conflicting traffic, and finally transitions to the target green phase.",
      formulas: [
        {
          name: "Phase Switch Execution Condition",
          math: "CanSwitch = (ElapsedGreen >= MinGreen) AND NOT IsYellowClearance",
          terms: [
            { var: "ElapsedGreen", desc: "Active green duration (seconds) elapsed since the last phase transition." },
            { var: "MinGreen", desc: "Configured minimum green stabilization threshold (default: 5s to 15s)." },
            { var: "IsYellowClearance", desc: "Boolean flag indicating if an amber clearance interval is currently active." }
          ],
          explanation: "Ensures intersection safety. Even if side street pressure is immense, the state machine blocks the phase switch until the active street has received its guaranteed minimum green time and is not mid-yellow."
        }
      ],
      workflowSteps: [
        { step: "1. Step Advancement", title: "Timer Increment", desc: "Every simulation step, increments elapsed phase timers and monitors active clearance states." },
        { step: "2. Request Ingestion", title: "Switch Evaluation", desc: "Receives switch requests from AdaptiveController or StarvationMonitor." },
        { step: "3. Guardrail Check", title: "Stabilization Verification", desc: "Evaluates Phase Switch Execution Condition. If false, latches request into pending buffer." },
        { step: "4. Amber Initiation", title: "Yellow Transition", desc: "Invokes traci.trafficlight.setPhase() to trigger the intermediate yellow clearance interval." },
        { step: "5. Green Handoff", title: "Phase Completion", desc: "Upon amber expiration, transitions to the target green phase index and resets elapsed timers to 0." }
      ],
      traciInteractions: [
        "traci.trafficlight.setPhase(tlsID, phaseIndex): Actuates phase transitions within the SUMO binary.",
        "traci.trafficlight.getPhase(tlsID): Verifies the current physical phase index of the traffic light."
      ],
      edgeCases: [
        { title: "Emergency Preemption Override", desc: "If an emergency vehicle demands immediate preemption, the state machine bypasses standard MinGreen guardrails, instantly truncates active green, and initiates an expedited yellow clearance." },
        { title: "Manual UI Phase Force", desc: "If a user clicks 'Force Phase Switch' in the Control Hub UI, the state machine latches the manual override, completes active yellow clearance if running, and switches phases." }
      ]
    }
  },
  {
    id: "adaptive-integrator",
    title: "Multi-Policy Weight Integrator",
    category: "core",
    level: "L3",
    icon: "⚖️",
    badge: "Weight Integrator",
    description: "The mathematical arbitration core that merges soft priority weights, pedestrian waiting pressure, and directional queues into unified phase demand scores for the AdaptiveController.",
    mechanics: [
      "Multi-Factor Weight Merging: Combines raw vehicle queues, accumulated pedestrian waiting times, and soft priority multipliers into a single scalar demand score.",
      "Directional Balancing: Computes competing pressure ratios between North-South and East-West corridors to evaluate active intersection equity.",
      "Dynamic Priority Scaling: Scales queue weights dynamically based on the presence of approaching transit buses or emergency vehicles."
    ],
    keyComponents: [
      { name: "AdaptiveIntegrator", desc: "Main mathematical integration class managing weight calculation and pressure balancing." }
    ],
    interdependencies: "Invoked every simulation step by AdaptiveController; bridges PrioritySystem and PedestrianHandler.",
    fullDetails: {
      overview: "The Multi-Policy Weight Integrator (`AdaptiveIntegrator`) acts as the mathematical brain of the adaptive control loop. In modern multi-modal intersections, deciding which street gets green requires balancing competing priorities: a queue of 10 cars versus 15 waiting pedestrians versus an approaching city bus. This integrator ingests these disparate metrics, applies configured policy weights (e.g., from `system_param_config.json`), and outputs unified directional demand scores to drive phase switching.",
      formulas: [
        {
          name: "Unified Directional Demand Score (Score_dir)",
          math: "Score_dir = (Queue_dir × W_veh) + (PedWait_dir × W_ped) + (PrioCount_dir × W_prio)",
          terms: [
            { var: "Queue_dir", desc: "Active count of stopped vehicles on the directional corridor." },
            { var: "PedWait_dir", desc: "Total accumulated waiting time of pedestrians at curbside crosswalks." },
            { var: "PrioCount_dir", desc: "Count of active priority vehicles (buses/EVs) approaching the corridor." },
            { var: "W_veh / W_ped / W_prio", desc: "Configured policy weight multipliers defined in system parameters." }
          ],
          explanation: "Calculates total corridor urgency. E.g., if North-South has 5 cars (weight 1.0) and 1 bus (weight 5.0), its total demand score is (5×1) + (1×5) = 10.0."
        },
        {
          name: "Competing Pressure Ratio (R_press)",
          math: "R_press = Score_competing / max(1.0, Score_active)",
          terms: [
            { var: "Score_competing", desc: "Unified demand score of the currently stopped red direction." },
            { var: "Score_active", desc: "Unified demand score of the currently active green direction." }
          ],
          explanation: "Evaluates relative equity. When R_press exceeds the configured switching threshold (e.g., 1.5), the integrator signals the AdaptiveController that the side street's demand has overpowered the main street."
        }
      ],
      workflowSteps: [
        { step: "1. Metric Ingestion", title: "Data Collection", desc: "Receives active queue lengths, pedestrian waiting times, and priority vehicle counts from DataCollector." },
        { step: "2. Policy Lookup", title: "Weight Fetching", desc: "Fetches active weight multipliers (weight_factor, prio_unit_cost, ped_weight) from system configuration." },
        { step: "3. Score Synthesis", title: "Math Integration", desc: "Calculates Score_ns and Score_ew using the Unified Directional Demand Score formula." },
        { step: "4. Ratio Evaluation", title: "Pressure Balancing", desc: "Computes Competing Pressure Ratio against active green directions." },
        { step: "5. Recommendation Export", title: "Decision Broadcast", desc: "Returns boolean switch recommendation and calculated pressure deltas to AdaptiveController." }
      ],
      traciInteractions: [
        "Mathematical Arbitration Only: Operates purely in Python memory on pre-collected metrics; does not execute TraCI calls."
      ],
      edgeCases: [
        { title: "Zero Active Demand Across All Approaches", desc: "If the intersection is completely empty, the integrator clamps demand scores to 0.0 and recommends maintaining the current active green phase indefinitely." },
        { title: "Extreme Priority Weight Disparity", desc: "If a user configures an extreme priority weight (e.g., W_prio = 1000), the integrator applies a logarithmic dampening function to prevent a single bus from permanently starving conflicting arterials." }
      ]
    }
  }
];

const FIELDS_DATA: FieldDoc[] = [

  {
    id: "temp-start-end",
    category: "Simulation Window",
    name: "Start / End Date & Time",
    jsonPath: "temporalParams.startDate / startTime / endDate / endTime",
    meaning: "Defines the precise temporal boundaries for historical traffic database ingestion and simulation execution.",
    action: "Sets the ISO timestamp range sent to Cloud Atlas for fetching real-world traffic flows.",
    effect: "Determines the traffic volume, rush hour peaks, and vehicle composition loaded into the simulation environment.",
    impactLevel: "High"
  },
  {
    id: "net-center-area",
    category: "Network Architecture",
    name: "Center Area Logic",
    jsonPath: "intersection_network.center_area",
    defaultValue: "Auto Detect (null)",
    meaning: "Configures how vehicle collisions and gridlock within the central physical intersection box are handled by the TraCI simulation engine.",
    action: "Toggles strict junction collision checking and central box yellow-grid clearance enforcement.",
    effect: "Setting to 'True' prevents vehicles from entering the intersection if their exit path is blocked, avoiding box lockups but potentially increasing approach delay. 'False' allows denser packing.",
    impactLevel: "High"
  },
  {
    id: "net-lanes-length",
    category: "Network Architecture",
    name: "Lanes Count & Observable Length",
    jsonPath: "structure_data.lanes[i].lanes_count / observable_length",
    defaultValue: "3 lanes / 250m",
    meaning: "Defines the physical capacity of each approach direction and the upstream distance covered by virtual TraCI induction loop detectors.",
    action: "Alters the road network geometry file and sets the maximum distance the predictive platoon logic can look ahead.",
    effect: "Increasing lanes boosts raw intersection throughput capacity. Increasing observable length gives the adaptive controller earlier warning of approaching platoons, improving green extension decisions.",
    impactLevel: "High"
  },
  {
    id: "net-lights-count",
    category: "Network Architecture",
    name: "Traffic & Pedestrian Lights Count",
    jsonPath: "structure_data.traffic_lights[i].stoplight_count / pedestrian_lights[i].stoplight_count",
    defaultValue: "Variable per approach",
    meaning: "Defines the physical number of signal heads and crosswalk indicator lights allocated to each intersection approach.",
    action: "Configures the TraCI junction state definitions and visual rendering infrastructure.",
    effect: "Ensures correct phase mapping between vehicular movements and corresponding pedestrian crosswalks in the underlying SUMO network definition.",
    impactLevel: "Medium"
  },
  {
    id: "net-sidewalk-width",
    category: "Network Architecture",
    name: "Sidewalk Widths (m)",
    jsonPath: "structure_data.pedestrians[i].sidewalkWidth",
    defaultValue: "3.0m",
    meaning: "The physical width of the pedestrian crosswalks and waiting curbs at each intersection corner.",
    action: "Adjusts the physical holding capacity for waiting pedestrian clusters before spillover occurs onto the roadway.",
    effect: "Wider sidewalks accommodate larger pedestrian platoons during peak transit discharge without causing artificial pedestrian jamming in the TraCI simulation.",
    impactLevel: "Low"
  },

  {
    id: "core-tls-prog",
    category: "Core System: Initial TLS Program",
    name: "Base Green / Fixed Red / Yellow Duration (s)",
    jsonPath: "initial_tls_program.green_duration / green_no_ped_duration / yellow_duration",
    defaultValue: "Green: 35s / Red: 5s / Yellow: 4s",
    meaning: "The foundational baseline timing parameters used when the controller operates in fixed-time mode or during initial adaptive warmup.",
    action: "Sets the default static phase durations loaded into the TraCI traffic light program before dynamic adaptive extensions take over.",
    effect: "Determines the baseline cycle length and clearance safety intervals. Yellow duration dictates the mandatory amber transition window between green and red phases.",
    impactLevel: "High"
  },

  {
    id: "core-min-green",
    category: "Core System: Adaptive Timing",
    name: "Min Green Time (s)",
    jsonPath: "adaptive_control.min_green_time",
    defaultValue: "10s",
    meaning: "The standard soft minimum duration a green light must remain active before the adaptive sigmoid logic is permitted to evaluate phase switches.",
    action: "Blocks phase transition requests during the initial green window.",
    effect: "Prevents rapid, confusing light flickering. Higher values ensure minimum platoon clearance but increase waiting times for opposing streets.",
    impactLevel: "Medium"
  },
  {
    id: "core-max-green",
    category: "Core System: Adaptive Timing",
    name: "Max Green Time (s)",
    jsonPath: "adaptive_control.max_green_time",
    defaultValue: "55s",
    meaning: "The standard soft maximum duration a green light can remain active under normal adaptive extension before forcing a transition.",
    action: "Triggers a mandatory phase switch when elapsed green time hits this threshold, unless overridden by preemption.",
    effect: "Prevents a single heavy traffic stream from holding the green light indefinitely. Lower values enforce quicker cycle turnover; higher values favor major arterial flow.",
    impactLevel: "High"
  },
  {
    id: "core-safety-min",
    category: "Core System: Adaptive Timing",
    name: "Safety Min Green Floor (s)",
    jsonPath: "adaptive_control.safety_min_green_floor",
    defaultValue: "5s",
    meaning: "The absolute, non-violable hard safety floor for green light duration under all circumstances, including emergency preemption.",
    action: "Acts as an ultimate TraCI guardrail. Even if an EV requests immediate preemption, the active green light will persist until this floor is reached.",
    effect: "Guarantees driver safety by ensuring drivers who just received a green light have enough time to react and clear the crosswalk before yellow/red transition.",
    impactLevel: "High"
  },
  {
    id: "core-hard-max",
    category: "Core System: Adaptive Timing",
    name: "Hard Max Green Ceiling (s)",
    jsonPath: "adaptive_control.hard_max_green_ceiling",
    defaultValue: "90s",
    meaning: "The absolute, non-violable hard upper limit for green light duration under all circumstances.",
    action: "Forces an unconditional phase cutoff, overriding even active emergency vehicle preemption holds if they exceed this limit.",
    effect: "Acts as a fail-safe against total system gridlock or broken preemption loop sensors, ensuring side streets eventually receive service.",
    impactLevel: "High"
  },
  {
    id: "core-preempt-bypass",
    category: "Core System: Adaptive Timing",
    name: "Enable Preemption Bypass",
    jsonPath: "adaptive_control.enable_preemption_bypass",
    defaultValue: "True",
    meaning: "Master switch allowing emergency vehicles to bypass standard mathematical queue-cost evaluations.",
    action: "When active, an approaching EV immediately forces the controller into a preemption state.",
    effect: "Disabling this forces emergency vehicles to wait for standard adaptive queue clearing, severely degrading EV response times but maintaining predictable civilian cycles.",
    impactLevel: "High"
  },
  {
    id: "core-ev-min-green",
    category: "Core System: Adaptive Timing",
    name: "EV Min Green (s)",
    jsonPath: "adaptive_control.preemption_min_green",
    defaultValue: "12s",
    meaning: "The minimum guaranteed green duration provided to the emergency vehicle's approach corridor once preemption is granted.",
    action: "Locks the green phase open for the EV's path for at least this duration.",
    effect: "Ensures the emergency vehicle and any civilian vehicles queued directly in front of it have adequate time to accelerate and clear the intersection box.",
    impactLevel: "Medium"
  },

  {
    id: "core-starv-pen",
    category: "Core System: Starvation & Sigmoid",
    name: "Max Starvation Penalty",
    jsonPath: "adaptive_control.no_preempt_policy.max_starvation_penalty",
    defaultValue: "25.0",
    meaning: "The maximum exponential weight added to competing red-light approaches as their waiting time increases.",
    action: "Injected into the numerator of the opposing phase urgency calculation.",
    effect: "Higher values make the controller highly sensitive to waiting side-street vehicles, forcing earlier green cutoffs on the main street to prevent starvation. Lower values favor arterial green waves.",
    impactLevel: "High"
  },
  {
    id: "core-max-red-lim",
    category: "Core System: Starvation & Sigmoid",
    name: "Max Red Limit (s)",
    jsonPath: "adaptive_control.dynamic_max_red.max_red_limit",
    defaultValue: "75s",
    meaning: "The maximum allowable waiting time for any vehicle approach before an emergency starvation override is trigger.",
    action: "If any detector experiences continuous red occupancy exceeding this limit, the controller immediately terminates the active green phase.",
    effect: "Eliminates extreme outlier delays (P95/P99) and ensures strict fairness, but can disrupt main-street platoon progression if set too low.",
    impactLevel: "High"
  },
  {
    id: "core-base-switch",
    category: "Core System: Starvation & Sigmoid",
    name: "Base Switch Cost",
    jsonPath: "adaptive_control.no_preempt_policy.base_switch_cost",
    defaultValue: "15.0",
    meaning: "The foundational mathematical resistance or 'inertia' against switching away from the current active green phase.",
    action: "Added to the active green phase's retention score before comparing against competing queues.",
    effect: "Higher values make the controller reluctant to switch lights, reducing lost time from yellow/red clearance intervals but increasing side-street wait times. Lower values cause snappy, frequent switches.",
    impactLevel: "High"
  },
  {
    id: "core-green-bonus",
    category: "Core System: Starvation & Sigmoid",
    name: "Green Active Bonus",
    jsonPath: "adaptive_control.no_preempt_policy.green_active_bonus",
    defaultValue: "10.0",
    meaning: "An additional score bonus awarded to the active green phase for every moving vehicle currently detected approaching the green light.",
    action: "Scales dynamically with active approaching volume to reward platoon maintenance.",
    effect: "Encourages the light to stay green while a dense platoon is actively flowing through. Once the platoon thins out, the bonus drops, allowing waiting side streets to take over.",
    impactLevel: "High"
  },
  {
    id: "core-queue-tol",
    category: "Core System: Starvation & Sigmoid",
    name: "Queue Tolerance",
    jsonPath: "adaptive_control.no_preempt_policy.queue_tolerance",
    defaultValue: "4.0",
    meaning: "The baseline number of waiting vehicles on a red approach that the system considers 'acceptable' before aggressively ramping up switch pressure.",
    action: "Acts as an offset in the competing queue pressure sigmoid formula.",
    effect: "Higher values allow small queues (e.g., 2-3 cars) to sit waiting without interrupting the main arterial green flow. Lower values make the system hyper-reactive to even a single waiting car.",
    impactLevel: "Medium"
  },
  {
    id: "core-thresh-cap",
    category: "Core System: Starvation & Sigmoid",
    name: "Threshold Cap",
    jsonPath: "adaptive_control.no_preempt_policy.max_threshold_cap",
    defaultValue: "100.0",
    meaning: "The absolute mathematical ceiling for the calculated phase retention threshold.",
    action: "Clamps the combined Base Switch Cost + Green Bonus score to prevent runaway retention values during extreme platoon events.",
    effect: "Guarantees that opposing queue pressure will eventually be able to overcome the active green phase, preventing infinite green lockup.",
    impactLevel: "Medium"
  },
  {
    id: "core-sigmoid-steep",
    category: "Core System: Starvation & Sigmoid",
    name: "Sigmoid Steepness",
    jsonPath: "adaptive_control.no_preempt_policy.sigmoid_steepness",
    defaultValue: "0.25",
    meaning: "Controls the mathematical acceleration curve of switch pressure as waiting queues grow.",
    action: "Multiplies the queue difference inside the exponential sigmoid function.",
    effect: "A steeper curve (higher value) causes switch pressure to explode rapidly as queues form, resulting in highly decisive, abrupt phase changes. A flatter curve provides smooth, gradual pressure transitions.",
    impactLevel: "Medium"
  },
  {
    id: "core-zero-waste",
    category: "Core System: Starvation & Sigmoid",
    name: "Zero-Waste Multiplier",
    jsonPath: "adaptive_control.no_preempt_policy.zero_waste_multiplier",
    defaultValue: "1.5",
    meaning: "A sensitivity booster that detects when an active green approach has emptied out (zero approaching vehicles).",
    action: "Multiplies competing queue pressure when the active green loop detector reports vacancy.",
    effect: "Drastically cuts down 'wasted green time' (green lights showing to empty roads) by snapping the light over to waiting streets the exact second the active platoon finishes clearing.",
    impactLevel: "High"
  },
  {
    id: "core-weight-factor",
    category: "Core System: Starvation & Sigmoid",
    name: "Pressure Scaling (Weight -> Q Factor)",
    jsonPath: "adaptive_control.no_preempt_policy.weight_to_queue_factor",
    defaultValue: "2.5",
    meaning: "The conversion factor that translates abstract priority weights (from buses/EVs) into physical vehicle queue equivalents.",
    action: "Multiplies priority weight scores before adding them to raw vehicle counts.",
    effect: "Determines how many 'virtual civilian cars' a single bus or EV represents. E.g., a factor of 3 means a bus with weight 5 exerts the same switch pressure as 15 waiting passenger cars.",
    impactLevel: "High"
  },
  {
    id: "core-prio-unit-cost",
    category: "Core System: Starvation & Sigmoid",
    name: "Priority Unit Cost",
    jsonPath: "adaptive_control.no_preempt_policy.priority_unit_cost",
    defaultValue: "1.0",
    meaning: "The incremental cost modifier applied per unit of priority weight present in competing queues.",
    action: "Directly scales the mathematical urgency of priority vehicles during sigmoid evaluation.",
    effect: "Allows fine-tuning of how aggressively priority vehicles degrade the active green phase's retention score.",
    impactLevel: "Medium"
  },
  {
    id: "core-clear-buf",
    category: "Core System: Starvation & Sigmoid",
    name: "Clearance Buffer & Post-Perfect Mult",
    jsonPath: "adaptive_control.predictive_logic.clearance_buffer / post_perfect_threshold_mult",
    defaultValue: "3.0s / 1.2",
    meaning: "Predictive parameters that provide a time buffer for trailing vehicles in a platoon and scale down retention bonus once a platoon is perfectly flushed.",
    action: "Maintains green extension for trailing gap buffers, then applies a multiplier to encourage phase termination.",
    effect: "Ensures straggling vehicles aren't caught in the intersection box, while preventing trailing singletons from artificially extending green time indefinitely.",
    impactLevel: "Medium"
  },

  {
    id: "core-dyn-red",
    category: "Dynamic Red & Stretch Logic",
    name: "Dynamic Max Red (Base / Limit / Compens.)",
    jsonPath: "adaptive_control.dynamic_max_red.base_red / max_congestion_vehicles / compensation_duration",
    defaultValue: "60s / 25 veh / 10s",
    meaning: "An advanced congestion-mitigation mechanism that dynamically shrinks maximum red light durations when physical queue spillback is imminent.",
    action: "When waiting queue exceeds 'Congestion Limit', the opposing green phase is truncated, and the congested street receives a 'Compensation Duration' green extension.",
    effect: "Prevents queues from backing up into upstream intersections (gridlock prevention), ensuring heavy bottlenecks are actively flushed.",
    impactLevel: "High"
  },
  {
    id: "core-stretch-startup-weather",
    category: "Dynamic Red & Stretch Logic",
    name: "Stretch Logic & QDR Thresholds (Startup / Weather)",
    jsonPath: "adaptive_control.stretch_logic.startup_stretch / startup_qdr_threshold / weather_stretch / weather_qdr_threshold",
    defaultValue: "Startup: 1.2, QDR: 0.5 / Weather: 1.3, QDR: 0.4",
    meaning: "Multipliers and Queue Dissipation Rate (QDR) trigger thresholds used to detect sluggish traffic discharge during warmup or bad weather.",
    action: "When observed QDR falls below the threshold, multiplies green duration by the stretch factor.",
    effect: "Compensates for poor vehicle acceleration in rain/fog or during initial simulation loading, preventing queue accumulation.",
    impactLevel: "Medium"
  },
  {
    id: "core-incident-det",
    category: "Dynamic Red & Stretch Logic",
    name: "Incident Detection (Min Time / Recent QDR / Avg QDR Min)",
    jsonPath: "adaptive_control.stretch_logic.incident_detection.min_time / recent_qdr_threshold / avg_qdr_min",
    defaultValue: "Min Time: 60s / Recent QDR: 0.2 / Avg QDR Min: 0.3",
    meaning: "Automated anomaly detection parameters that identify severe physical blockages, lane closures, or accidents.",
    action: "Compares short-term recent QDR against long-term average QDR over 'Min Time'. If discharge drops below thresholds, triggers emergency incident timing relief.",
    effect: "Instantly adapts signal timing to flush lanes adjacent to a crash site, mitigating secondary bottleneck shockwaves.",
    impactLevel: "High"
  },

  {
    id: "prof-master",
    category: "Traffic Profiles",
    name: "Enable Dynamic Traffic Profiles & Switch Stabilization",
    jsonPath: "adaptive_control.use_volume_profiles / volume_profiles.switch_stabilization_s",
    defaultValue: "True / 300s",
    meaning: "Master toggle for volume-based behavioral shifts and the hysteresis timer that prevents rapid toggling between profiles.",
    action: "Continuously monitors total intersection vehicle volume. If volume crosses thresholds, shifts controller parameters after the stabilization window elapses.",
    effect: "Enables the intersection to automatically morph its behavior (e.g., from snappy low-volume switching to heavy arterial green-wave holding) as daily traffic builds and wanes.",
    impactLevel: "High"
  },
  {
    id: "prof-high-low",
    category: "Traffic Profiles",
    name: "High / Low Traffic Profile Multipliers",
    jsonPath: "adaptive_control.volume_profiles.high_traffic / low_traffic",
    defaultValue: "High Thr: 150 veh / Low Thr: 30 veh",
    meaning: "Sets of dynamic multipliers applied to Base Switch Cost, Green Bonus, Starvation Penalty, Queue Tolerance, and Min/Max Green.",
    action: "When active volume exceeds High Threshold (e.g., >150 veh), High multipliers scale up Green Bonus and Max Green. When volume drops below Low Threshold, Low multipliers reduce Switch Cost.",
    effect: "High profile prioritizes flushing massive arterial platoons and resisting interruptions. Low profile creates an ultra-responsive, snappy intersection where lone arriving cars get immediate green lights.",
    impactLevel: "High"
  },
  {
    id: "prof-rush",
    category: "Traffic Profiles",
    name: "Rush Hour Orchestration & Biasing",
    jsonPath: "adaptive_control.rush_hour_config.morning_rush_start_hour / ns_bias / ew_bias",
    defaultValue: "Morning: 7-9 / Evening: 16-18. NS Bias: 0.8 / EW Bias: 1.2",
    meaning: "Configures specific time-of-day peak windows and directional switch threshold multipliers.",
    action: "During active rush hours, multiplies competing switch thresholds by the directional bias factor.",
    effect: "A bias < 1.0 (e.g., 0.8 on N-S) makes it 20% easier for the North-South corridor to retain or seize the green light, creating an artificial green wave for morning/evening commuters.",
    impactLevel: "High"
  },

  {
    id: "prio-weights",
    category: "Priority & Fairness",
    name: "EV / Bus Base & Urgent Weights",
    jsonPath: "adaptive_priority_policy.emergency_base_weight / bus_weight_normal / urgent",
    defaultValue: "EV Base: 10, Urgent: 20 / Bus Base: 3, Stress: 5",
    meaning: "The baseline and escalated importance multipliers assigned to approaching emergency vehicles and public transit buses.",
    action: "Injected into the Adaptive Integrator's urgency scoring matrix.",
    effect: "Determines how aggressively the system favors transit and emergency vehicles over standard passenger cars. Urgent weights kick in when vehicles experience extended delays or approach stop lines.",
    impactLevel: "High"
  },
  {
    id: "prio-caps",
    category: "Priority & Fairness",
    name: "Hard Streak Cap & Recovery Bonus",
    jsonPath: "adaptive_priority_policy.hard_streak_cap / recovery_bonus",
    defaultValue: "Cap: 3 / Bonus: 5.0",
    meaning: "Fairness safeguards that limit consecutive priority phases and reward side streets following priority overrides.",
    action: "Forces a phase transition after 'Streak Cap' consecutive priority extensions; adds 'Recovery Bonus' to opposing queues post-override.",
    effect: "Ensures that heavy bus corridors cannot starve side streets for multiple cycles in a row. The recovery bonus guarantees trapped side-street traffic is flushed immediately after the bus passes.",
    impactLevel: "High"
  },
  {
    id: "prio-ped-guard",
    category: "Priority & Fairness",
    name: "Ped Guard Threshold (s)",
    jsonPath: "adaptive_priority_policy.ped_guard_threshold_s",
    defaultValue: "15s",
    meaning: "The maximum time an active pedestrian walk phase can be delayed by incoming vehicle priority requests.",
    action: "If a pedestrian call has been waiting longer than this threshold, vehicle priority extensions (like Bus priority) are blocked until the pedestrian is serviced.",
    effect: "Protects vulnerable pedestrians from being stranded on curbs indefinitely during heavy transit schedules.",
    impactLevel: "Medium"
  },
  {
    id: "prio-adv-urg",
    category: "Priority & Fairness",
    name: "Advanced Urgency (Wait / ETA Urgent & Gain)",
    jsonPath: "adaptive_priority_policy.emergency_wait_urgent_s / emergency_eta_urgent_s / emergency_wait_gain",
    defaultValue: "Wait Urgent: 30s / ETA Urgent: 15s / Gain: 0.2",
    meaning: "Parameters governing the exponential escalation of priority weights as vehicles experience delay or draw near the intersection.",
    action: "Continuously ramps up priority weight as waiting time exceeds 'Wait Urgent' or ETA drops below 'ETA Urgent'.",
    effect: "Ensures that even a low-priority bus or a distant EV eventually generates overwhelming switch pressure if trapped in a distant queue, guaranteeing bounded maximum delays.",
    impactLevel: "Medium"
  },
  {
    id: "prio-bus-stress",
    category: "Priority & Fairness",
    name: "Bus Stress Weight & Fairness Penalty",
    jsonPath: "adaptive_priority_policy.bus_weight_stress / fairness_penalty",
    defaultValue: "Stress: 5.0 / Penalty: 2.0",
    meaning: "Escalated weight applied to buses behind schedule and the mathematical deduction applied to recently favored movements.",
    action: "Boosts bus priority score when schedule deviation is detected; subtracts penalty from movements that recently received extended green windows.",
    effect: "Helps delayed transit catch up to timetables while actively preventing systematic starvation of opposing traffic flows.",
    impactLevel: "Medium"
  },
  {
    id: "prio-fairness-pen",
    category: "Priority & Fairness",
    name: "Opposite Flow Boost & Hysteresis Steps",
    jsonPath: "adaptive_priority_policy.fairness_opposite_boost / hysteresis_update_steps",
    defaultValue: "Boost: 3.0 / Hysteresis: 5 steps",
    meaning: "An urgency multiplier awarded to opposing flows during priority arbitration and the step interval for updating hysteresis states.",
    action: "Artificially inflates opposing queue pressure during active priority calls to ensure arbitration remains balanced over time.",
    effect: "Prevents priority vehicles from completely locking out opposing traffic when platoons arrive simultaneously.",
    impactLevel: "Medium"
  },
  {
    id: "prio-sys-calib",
    category: "Priority & Fairness",
    name: "EV Wait Cap / ETA Floor / Bus Wait Gain / Bonus Cap",
    jsonPath: "adaptive_priority_policy.emergency_wait_cap_s / emergency_eta_floor_s / bus_wait_gain / direction_bonus_cap",
    defaultValue: "Wait Cap: 120s / ETA Floor: 5s / Bus Gain: 0.1 / Bonus Cap: 20.0",
    meaning: "System calibration bounds that clamp maximum accumulated wait multipliers, establish minimum ETA clamping, and cap directional recovery bonuses.",
    action: "Restricts priority weight inflation to prevent integer overflow or complete starvation lockup in extreme congestion scenarios.",
    effect: "Maintains mathematical stability within the priority arbitration engine, ensuring predictable controller behavior under heavy saturation.",
    impactLevel: "Medium"
  },
  {
    id: "prio-stress-debt",
    category: "Priority & Fairness",
    name: "Streak Trigger / Hyst Persistence / Ped Stress / Debt Limit",
    jsonPath: "adaptive_priority_policy.fairness_streak_trigger / hysteresis_persist_cycles / stress_ped_wait_threshold_s / stress_debt_threshold",
    defaultValue: "Streak: 2 / Persist: 3 cycles / Ped Stress: 45s / Debt Limit: 50",
    meaning: "Advanced fairness accounting parameters that track accumulated starvation debt and pedestrian waiting stress across multiple light cycles.",
    action: "When starvation debt or pedestrian wait time breaches these thresholds, the controller forces an immediate fairness relief phase.",
    effect: "Guarantees strict long-term equity between vehicular transit corridors and pedestrian crosswalks.",
    impactLevel: "High"
  },

  {
    id: "preempt-crit-trig",
    category: "EV Preemption System",
    name: "Detection ETA / Max Search Dist / Max Hold",
    jsonPath: "ev_preemption_policy.detection_eta_threshold / max_detection_distance_m / ev_max_hold_steps",
    defaultValue: "ETA: 25s / Dist: 350m / Hold: 90 steps",
    meaning: "The primary spatial and temporal detection triggers that initiate an emergency vehicle preemption sequence.",
    action: "Continuously scans TraCI vehicle streams within 'Max Search Dist' and approaching within 'Detection ETA'. Once verified, holds the green phase for up to 'Max Hold' steps.",
    effect: "Guarantees emergency vehicles receive a cleared intersection upon arrival, drastically reducing emergency response times.",
    impactLevel: "High"
  },
  {
    id: "preempt-guardrails",
    category: "EV Preemption System",
    name: "Strict Min Green / Ped Guard Active / Bounded Preempt / Preempt Min Green",
    jsonPath: "ev_preemption_policy.strict_min_green / ped_guard_enabled / bounded_preemption_enabled / min_green_time_preempt",
    defaultValue: "Strict Min: True / Ped Guard: True / Bounded: True / Min Green: 10s",
    meaning: "Critical safety guardrails that prevent preemption overrides from causing civilian accidents or stranding pedestrians.",
    action: "Enforces mandatory minimum green times and pedestrian clearance windows before allowing the signal heads to transition to the EV's approach.",
    effect: "Eliminates the risk of right-angle collisions caused by abruptly terminating a civilian green phase without adequate clearance intervals.",
    impactLevel: "High"
  },
  {
    id: "preempt-fair-tight",
    category: "EV Preemption System",
    name: "Tightening Logic (Wait Tighten / Gap Tighten / Hyst Base)",
    jsonPath: "ev_preemption_policy.fairness_logic.min_wait_tighten / wait_gap_tighten / hysteresis_base",
    defaultValue: "Wait: 20s / Gap: 10s / Hyst Base: 2.0",
    meaning: "Arbitration parameters used when multiple emergency vehicles approach the intersection simultaneously from conflicting directions.",
    action: "Dynamically tightens the preemption qualification criteria for secondary EVs based on the waiting time and gap separation of the primary EV.",
    effect: "Prevents conflicting emergency vehicles from causing signal gridlock, establishing a clear, mathematically sound right-of-way hierarchy.",
    impactLevel: "High"
  },
  {
    id: "preempt-fair-relax",
    category: "EV Preemption System",
    name: "Relaxation Logic & Reverse Relaxation",
    jsonPath: "ev_preemption_policy.fairness_logic.pressure_ratio_relax_1 / min_wait_relax_1 / pressure_ratio_rev_relax",
    defaultValue: "Relax Ratio 1: 1.5 / Wait 1: 30s / Rev Relax: 0.8",
    meaning: "Advanced arbitration adjustments that relax preemption restrictions when opposing civilian queues reach extreme pressure levels.",
    action: "Temporarily suspends EV preemption holds if civilian queue pressure exceeds the EV's priority weight by the specified relaxation ratios.",
    effect: "Prevents a continuous stream of emergency vehicles from permanently locking out civilian arterial corridors.",
    impactLevel: "Medium"
  },
  {
    id: "preempt-hyst-adv",
    category: "EV Preemption System",
    name: "Hysteresis & Advanced Arbitration (Hyst Step / Wait Hyst / Gap Hyst)",
    jsonPath: "ev_preemption_policy.fairness_logic.hysteresis_step / min_wait_hyst_tighten / wait_gap_hyst_tighten",
    defaultValue: "Step: 0.5 / Wait Hyst: 15s / Gap Hyst: 5s",
    meaning: "Granular hysteresis tuning values that prevent rapid oscillation between preemption grants during complex multi-EV scenarios.",
    action: "Applies step-wise damping to preemption evaluation thresholds as vehicle separation gaps fluctuate.",
    effect: "Ensures smooth, decisive preemption handoffs between closely trailing emergency vehicles.",
    impactLevel: "Medium"
  },
  {
    id: "preempt-sys-calib",
    category: "EV Preemption System",
    name: "System Calibration (EV Pressure Mult / Bus Det Base / Stale Eps / Flush Fact)",
    jsonPath: "ev_preemption_policy.ev_pressure_multiplier / bus_detection_base / stale_distance_epsilon_m / queue_flush_factor",
    defaultValue: "EV Mult: 2.0 / Bus Base: 1.5 / Stale Eps: 2.0m / Flush Fact: 1.5",
    meaning: "Fine-tuning parameters that calibrate TraCI loop detector sensitivity, filter out stale/stopped vehicles, and scale queue flushing urgency.",
    action: "Adjusts raw TraCI detection distances and speeds to filter out false preemption calls from parked or slow-moving emergency vehicles.",
    effect: "Ensures preemption is only granted to active, high-speed emergency vehicles actively navigating toward the junction.",
    impactLevel: "Medium"
  },
  {
    id: "preempt-maint-debt",
    category: "EV Preemption System",
    name: "Maintenance Floors & Debt (Floor ETA / Handoff Steps / Starve Debt Gain)",
    jsonPath: "ev_preemption_policy.emergency_floor_eta_s / layer_handoff_cooldown_steps / starvation_debt_gain_per_step",
    defaultValue: "Floor ETA: 5s / Handoff: 10 steps / Debt Gain: 1.0",
    meaning: "Underlying debt accounting parameters that track the collateral delay damage inflicted on civilian corridors during active preemption.",
    action: "Accumulates starvation debt per step of active preemption. Once preemption clears, forces a mandatory relief window for the starved approaches.",
    effect: "Guarantees rapid post-preemption queue stabilization and equitable recovery for civilian traffic.",
    impactLevel: "High"
  },

  {
    id: "ped-active-mode",
    category: "Pedestrian Control System",
    name: "Active Weighting Mode",
    jsonPath: "pedestrian_control.active_mode",
    defaultValue: "Balanced (balanced)",
    meaning: "Master operational mode determining how pedestrian crosswalk calls are prioritized relative to vehicular traffic.",
    action: "Shifts internal controller weighting between 'Vehicle First' (zero ped influence), 'Balanced' (normal weighting), and 'Pedestrian First' (max ped influence).",
    effect: "In 'Pedestrian First', walk phases are serviced almost instantly upon button actuation. In 'Vehicle First', pedestrians must wait for natural vehicular gap windows.",
    impactLevel: "High"
  },
  {
    id: "ped-weights-thresh",
    category: "Pedestrian Control System",
    name: "Wait Threshold / Max Duration / Extension per Ped / Mode Weights",
    jsonPath: "pedestrian_control.priority_threshold / max_ped_phase_duration / extension_per_ped / weight_balanced",
    defaultValue: "Wait Thr: 30s / Max Dur: 45s / Ext: 2s / Balanced Wt: 5.0",
    meaning: "Core parameters governing pedestrian phase actuation, green extension per crossing individual, and urgency multipliers.",
    action: "Triggers a pedestrian walk phase when wait time exceeds 'Wait Thr'; extends walk duration by 'Ext' seconds for each active pedestrian detected.",
    effect: "Ensures large pedestrian groups are granted sufficient crossing time while preventing singletons from holding up arterial traffic indefinitely.",
    impactLevel: "High"
  },
  {
    id: "ped-fine-tuning",
    category: "Pedestrian Control System",
    name: "Fine-Tuning (Clearance Time / Cooldown / Base Duration / Safety Min Green)",
    jsonPath: "pedestrian_control.clearance_time / cooldown / base_duration / ped_safety_min_green",
    defaultValue: "Clearance: 10s / Cooldown: 20s / Base Dur: 15s / Safety Min: 5s",
    meaning: "Physical safety and clearance parameters for the pedestrian crosswalk infrastructure.",
    action: "Enforces a mandatory flashing red/don't walk clearance interval ('Clearance Time') and a mandatory lockout window ('Cooldown') between consecutive walk phases.",
    effect: "Protects pedestrians currently in the crosswalk during phase transitions and prevents back-to-break pedestrian calls from permanently halting vehicular traffic.",
    impactLevel: "High"
  },

  {
    id: "env-policy-mult",
    category: "Environmental Policy",
    name: "Zero Waste Mult & Guard Suppression",
    jsonPath: "adaptive_control.no_preempt_policy.zero_waste_multiplier / adaptive_priority_policy.ped_guard_suppression",
    defaultValue: "Zero Waste: 1.5 / Guard Supp: 0.5",
    meaning: "Environmental optimization parameters designed to minimize carbon emissions by eliminating wasted green time and suppressing unnecessary stops.",
    action: "Aggressively truncates green phases showing to empty approaches and dynamically modulates pedestrian guardrail sensitivity during peak emissions surges.",
    effect: "Substantially reduces intersection-wide CO2 and fuel consumption by smoothing vehicular trajectories and maintaining green waves.",
    impactLevel: "Medium"
  },

  {
    id: "exec-sim-source",
    category: "Execution Hub",
    name: "Simulation Mode & Traffic Source",
    jsonPath: "executionOptions.mode / realTrafficSource",
    defaultValue: "Mode: real / Source: stream",
    meaning: "Determines the foundational origin of simulation traffic demand: synthetic random generation versus historical/live database streams.",
    action: "Configures the TraCI vehicle insertion engine and loads appropriate route distribution files.",
    effect: "Enables testing controller configurations against highly realistic, real-world traffic patterns rather than idealized synthetic flows.",
    impactLevel: "High"
  },
  {
    id: "exec-flags-configs",
    category: "Execution Hub",
    name: "Execution Flags & Scenario Selection",
    jsonPath: "executionOptions.simTime / useGui / earlyStop / benchmarkMode / includeConfigs",
    defaultValue: "Sim Time: 720s / GUI: False / Benchmark: True / Configs: All 6",
    meaning: "Comprehensive runtime execution controls that dictate simulation horizon length, visual rendering toggles, automated early stopping on degradation, and active comparison baselines.",
    action: "Orchestrates the execution of multiple parallel TraCI simulation instances across the selected controller configurations.",
    effect: "Allows rapid, automated benchmarking of candidate controllers, generating rich comparative telemetry across all selected operational modes.",
    impactLevel: "High"
  },

  {
    id: "opt-mode-goal",
    category: "Optimizer Hub",
    name: "Optimization Mode, Objective Goal & Baselines",
    jsonPath: "optimizerOptions.mode / goal / baselineName / optimizeConfig",
    defaultValue: "Mode: generic / Goal: balanced / Baseline: fixed no preempt",
    meaning: "Defines the hyperparameter tuning strategy, the mathematical objective function to maximize/minimize, and the reference baseline for cost normalization.",
    action: "Configures the Rapid Grid Search algorithm and initializes the candidate parameter space.",
    effect: "Directly steers the optimization sweep to find parameter sets tailored for specific policy outcomes (e.g., Eco, Throughput, EV Focus).",
    impactLevel: "High"
  },
  {
    id: "opt-search-const",
    category: "Optimizer Hub",
    name: "Search Constraints (Ph1/Ph2 Sim Time / Ped Delay Limit / Max Starv / Spillback Cap)",
    jsonPath: "optimizerOptions.phase1SimTime / phase2SimTime / maxPedWorsenPct / maxStarvation / maxQueueCap / patienceCap / metaStages",
    defaultValue: "Ph1: 360s / Ph2: 720s / Ped Limit: 15% / Starv: 2 / Spillback: 25",
    meaning: "Rigorous boundary constraints enforced during grid search exploration to ensure candidate parameter sets remain safe and viable.",
    action: "Automatically prunes candidate configurations that violate maximum allowable pedestrian delay degradation, starvation limits, or queue spillback caps.",
    effect: "Guarantees that the optimizer only returns winning profiles that maintain strict real-world safety and fairness standards.",
    impactLevel: "High"
  },
  {
    id: "opt-meta-scaling",
    category: "Optimizer Hub",
    name: "Meta Scaling Search Space (High/Low Switch, Bonus & Starv Ranges)",
    jsonPath: "optimizerOptions.metaHighSwitchMin...metaLowStarvMax",
    defaultValue: "Configurable min/max float ranges",
    meaning: "Advanced search space definitions that allow the optimizer to tune the dynamic volume profile multipliers themselves.",
    action: "Explores multi-dimensional scaling factors for High and Low traffic profiles during meta-optimization rounds.",
    effect: "Identifies the perfect volume-based adaptation curves, ensuring the controller scales flawlessly across extreme traffic density variations.",
    impactLevel: "High"
  },
  {
    id: "opt-flags-stages",
    category: "Optimizer Hub",
    name: "Behavioral Flags & Active Optimization Stages",
    jsonPath: "optimizerOptions.safeGuard / strictStarvation / refreshBaseline / benchmarkMode / includeStages",
    defaultValue: "SafeGuard: True / Strict Starv: False / Stages: Auto (Goal-Based)",
    meaning: "Granular algorithmic execution flags that control parameter clamping, starvation strictness, baseline refreshing, and stage-specific focusing (Priority vs Adaptive vs Preemption vs Meta).",
    action: "Customizes the internal execution loops of `rapid_grid_search.py` to target specific controller subsystems.",
    effect: "Provides complete developer control over the hyperparameter tuning pipeline, enabling highly efficient, targeted optimization sweeps.",
    impactLevel: "High"
  }
];

const CHARTS_DATA: ChartDoc[] = [
  {
    id: "chart-sec1",
    section: "Section 1: Vehicle & Pedestrian Composition",
    title: "Traffic Demographics & Mode Share",
    icon: "📊",
    whatItShows: "Displays the absolute counts and percentage breakdown of all simulated road users, including Passenger Vehicles, Emergency Vehicles, Public Transport (Buses), and Pedestrians.",
    howToCompare: "Use this section as a baseline validation check. When comparing multiple controller configurations (e.g., Adaptive vs. Fixed), verify that total vehicle and pedestrian counts are nearly identical to ensure a fair, apples-to-apples performance evaluation.",
    proTip: "If you notice significant discrepancies in total vehicle counts between runs, check if severe congestion in one configuration caused upstream vehicle insertion jamming (spillback locking)."
  },
  {
    id: "chart-sec2-summary",
    section: "Section 2: Delay & Starvation Summary",
    title: "Core Delay & Starvation Benchmarks",
    icon: "⏳",
    whatItShows: "Presents comparative bar charts for Average Delay (s), Maximum Delay (s), Individual Life Experience (Avg Delay per road user), Steady-State Delay (post-warmup), and Starvation Events across all tested controller modes.",
    howToCompare: "Select a specific User Class (e.g., 'All Vehicles', 'Emergency', 'Pedestrian') and observe the percentage difference badges relative to your chosen Baseline. Look for configurations that drive Average Delay into green negative percentages while keeping Starvation Events bounded.",
    proTip: "Pay close attention to 'Steady-State Delay'. It excludes the initial simulation warmup period, providing the truest measure of how the controller performs under continuous, stable traffic loads."
  },
  {
    id: "chart-sec2-p95",
    section: "Section 2: Delay & Starvation Summary",
    title: "P95 & P99 Delay Equity (Tail-End Proxies)",
    icon: "⚖️",
    whatItShows: "Focuses exclusively on the worst-case waiting times experienced by the 95th and 99th percentile of road users. It isolates severe outlier delays that are often masked by healthy average delay figures.",
    howToCompare: "Compare P95/P99 values between Adaptive and Fixed modes. An exceptional adaptive controller will not only reduce average delay but will also compress P95/P99 wait times, proving that side-street traffic is not being unfairly sacrificed.",
    proTip: "If a configuration shows excellent Average Delay but a massive spike in P95 Delay, it indicates a severe fairness imbalance—likely caused by an over-aggressive Starvation Penalty or excessive Priority Streak Caps."
  },
  {
    id: "chart-sec3-emissions",
    section: "Section 3: Environmental & Emissions Summary",
    title: "Carbon & Fuel Footprint Analytics",
    icon: "🌱",
    whatItShows: "Details the environmental impact of traffic flow, displaying Average/Total CO2 emissions (g) and Average/Total Fuel consumption (g) broken down by vehicle category.",
    howToCompare: "Toggle between 'Avg CO2', 'Total CO2', 'Avg Fuel', and 'Total Fuel', and filter by vehicle category. When evaluating 'Eco' optimized profiles from the Control Hub, look for substantial percentage reductions in total carbon output compared to standard baselines.",
    proTip: "Environmental metrics correlate heavily with vehicle stop counts. A configuration that establishes smooth green waves will show dramatically lower CO2 figures than one with frequent, snappy light switches that force heavy platoons to stop and re-accelerate."
  },
  {
    id: "chart-sec4-congestion",
    section: "Section 4: Congestion & Signal Timing Analytics",
    title: "Advanced Queue Health & Congestion Index",
    icon: "🔥",
    whatItShows: "Plots macro-level intersection health indicators: Congestion Index, Average/Peak Total Queue lengths, Starvation/Preemption Event counts, Stabilization Time, and total raw Throughput.",
    howToCompare: "Use the interactive chart tooltip to perform a holistic health check. The ultimate apex controller configuration will demonstrate a minimized Congestion Index, minimized Peak Queue lengths, zero Starvation Events, and maximized Throughput.",
    proTip: "Examine 'Stabilization Time' closely. It reveals exactly how many seconds it takes for the intersection to recover and clear trapped side-street queues following a disruptive emergency vehicle preemption event."
  },
  {
    id: "chart-sec4-timing",
    section: "Section 4: Congestion & Signal Timing Analytics",
    title: "Signal Timing Parity & Switch Dynamics",
    icon: "⏱️",
    whatItShows: "A comprehensive data table breaking down the physical mechanics of the traffic lights: Minimum, Maximum, and Average durations for Green, Yellow, and Red phases, plus total Green-to-Red light switch counts for N-S and E-W axes.",
    howToCompare: "Compare the timing flexibility of Adaptive configurations against Fixed baselines. Observe how Adaptive modes dynamically expand Max Green during peak flows and increase switch counts during light traffic to minimize civilian waiting times.",
    proTip: "Verify that 'Min Green' and 'Yellow' durations remain strictly bounded by your Core System safety settings in the Control Hub. This ensures mathematical optimization never compromises real-world physical safety constraints."
  }
];

const TELEMETRY_DATA: TelemetryDoc[] = [
  {
    id: "tel-queue",
    variable: "Queue Lengths (N-S, E-W, Total)",
    unit: "Vehicles (count)",
    icon: "🚗",
    whatItShows: "The active, second-by-second count of vehicles currently stopped or moving at sub-threshold speeds (<5 km/h) on approaching road segments.",
    howToAnalyze: "Track the cyclic rise and fall of the queue curves. During a red light, the curve slopes upward as vehicles accumulate. When the light turns green, the curve should sharply drop back to zero.",
    performanceIndicator: "Optimal platoon flushing occurs when green light intervals perfectly match queue peaks and terminate immediately once the queue hits zero (Zero-Waste). Persistent, non-zero queue valleys indicate chronic underservicing or spillback gridlock."
  },
  {
    id: "tel-delay",
    variable: "Average & Max Delay",
    unit: "Seconds (s)",
    icon: "⏳",
    whatItShows: "The instantaneous accumulated waiting time experienced by active vehicles and pedestrians currently traversing the network.",
    howToAnalyze: "Look for sudden vertical spikes in the delay curve. These typically correspond to emergency preemption holds or temporary oversaturation during rush hour surges.",
    performanceIndicator: "A high-performing system maintains a low, stable delay plateau across the entire simulation lifespan. Rapidly compounding delay curves indicate that arrival demand has permanently exceeded intersection discharge capacity."
  },
  {
    id: "tel-throughput",
    variable: "Throughput & Cleared Counts",
    unit: "Vehicles / Pedestrians (count)",
    icon: "📈",
    whatItShows: "The cumulative or rate-based count of road users successfully discharged through the intersection stop lines.",
    howToAnalyze: "Examine the slope (derivative) of the cumulative throughput curve. A steeper, linear upward slope represents a high, consistent discharge rate.",
    performanceIndicator: "When comparing two controller modes via chart overlays, the configuration with the higher throughput curve at the end of the simulation window proves superior physical capacity utilization."
  },
  {
    id: "tel-events",
    variable: "Starvation & Preemption Events",
    unit: "Discrete Event Markers",
    icon: "⚡",
    whatItShows: "Visual vertical markers and background highlight bands indicating exactly when an Emergency Vehicle triggered a preemption override or when a minor street suffered starvation.",
    howToAnalyze: "Observe the behavioral changes in Queue Lengths and Delay curves immediately following an event marker.",
    performanceIndicator: "Evaluate 'Preemption Recovery'. In a robust adaptive system, the severe queue spike on the opposing street caused by a preemption hold should rapidly dissipate and return to baseline levels within 60-90 seconds (Stabilization Time)."
  },
  {
    id: "tel-weights",
    variable: "Adaptive Weights & Decision Thresholds",
    unit: "Mathematical Score (weight)",
    icon: "🎛️",
    whatItShows: "The active internal calculation values of the controller's mathematical sigmoid function, showing active phase retention bonuses versus competing queue pressures.",
    howToAnalyze: "Overlay this variable with Signal Light Status. You can see the exact mathematical intersection point where competing queue pressure crossed the active green threshold, triggering a phase switch.",
    performanceIndicator: "Validates controller correctness. Ensures that light switches are driven purely by active mathematical demand rather than arbitrary timer expiration."
  },
  {
    id: "tel-env",
    variable: "Environmental Telemetry (CO2 & Fuel Rate)",
    unit: "Grams per second (g/s)",
    icon: "💨",
    whatItShows: "The second-by-second estimated tailpipe emissions and fuel burn rates across the entire active vehicle population.",
    howToAnalyze: "Correlate emission spikes with light transitions. You will observe massive CO2 spikes immediately following a green light onset as heavy vehicle platoons accelerate from a dead stop.",
    performanceIndicator: "Eco-optimized systems will display flatter, smoother emission curves by minimizing stop-and-go shockwaves and maintaining steady-state platoon velocities."
  },
  {
    id: "tel-ped",
    variable: "Pedestrian Counts & Wait Times",
    unit: "Pedestrians (count) / Seconds (s)",
    icon: "🚶",
    whatItShows: "The active volume of pedestrians waiting at curbside push-buttons and their corresponding accumulated crossing delay.",
    howToAnalyze: "Monitor curbside accumulation during long vehicle green phases. Watch for the mandatory vehicle cutoff triggered when pedestrian wait times hit the configured patience cap.",
    performanceIndicator: "Proves active transit equity. Ensures pedestrian wait times remain strictly bounded without causing unnecessary vehicle stops during periods of zero curbside demand."
  },
  {
    id: "tel-qdr",
    variable: "Queue Dissipation Rate (QDR)",
    unit: "Vehicles per second (veh/s)",
    icon: "🚀",
    whatItShows: "The speed at which a stopped vehicle platoon clears the stop line once the signal turns green.",
    howToAnalyze: "Compare QDR across different weather profiles or incident injection windows in the simulation.",
    performanceIndicator: "A drop in QDR triggers the controller's Stretch Logic, automatically extending green windows to compensate for sluggish physical discharge rates."
  },
  {
    id: "tel-lane-util",
    variable: "Lane Utilization & Congestion Intensity",
    unit: "Percentage (%) / Spatial Ratio",
    icon: "🛣️",
    whatItShows: "The spatial balance of vehicle distribution across available approach lanes and the physical density of vehicle packing relative to total road storage.",
    howToAnalyze: "Identify lane imbalance where one lane is backed up while adjacent lanes remain empty, or track overall congestion intensity approaching 1.0 (total spillback).",
    performanceIndicator: "High lane utilization parity indicates excellent upstream sorting. Congestion intensity remaining well below 1.0 confirms the Dynamic Max Red system is successfully preventing intersection gridlock."
  }
];

const COLLECTION_METRIC_SECTIONS = [
  {
    id: "methodology",
    title: "Core Methodology Engines",
    subtitle: "TraCI Telemetry Ingestion, Polling Mechanics & LTTB Downsampling",
    groups: [
      "Vehicle Kinematics & Induction Loop Emulation (E1 / E2 / E3)",
      "Environmental & Emissions Calculation (HBEFA3 / PHEMlight)",
      "Queue Length & Platoon Shockwave Tracking",
      "Pedestrian Telemetry & Active Transport Ingestion",
      "Downsampling Precision Engine (Largest Triangle Three Buckets)"
    ],
  },
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

const COLLECTION_METRIC_GROUPS: Array<{
  title: string;
  icon: string;
  description: string;
  formula: string;
  metrics: Array<{
    key: string;
    label: string;
    color: string;
    unit: string;
    definition: string;
  }>;
}> = [
    {
      title: "Total Delays (Pressure)",
      icon: "💥",
      description: "Aggregate cumulative waiting time across all active road users in the network. Represents the total systemic pressure and time loss accumulated second-by-second.",
      formula: "Wait_Total = Avg_Wait × Active_Count",
      metrics: [
        { key: "all_v_wait_total", label: "All Vehicle Wait Total", color: "#1d4ed8", unit: "s", definition: "The sum total of waiting time for all vehicle classes combined." },
        { key: "v_wait_total", label: "Regular Vehicle Wait Total", color: "#3b82f6", unit: "s", definition: "Cumulative delay experienced strictly by civilian passenger vehicles and trucks." },
        { key: "ev_wait_total", label: "Emergency Vehicle Wait Total", color: "#b91c1c", unit: "s", definition: "Total delay accumulated by active emergency vehicles. In an optimized system, this should remain near zero." },
        { key: "pt_wait_total", label: "Public Transport Wait Total", color: "#0f766e", unit: "s", definition: "Aggregate waiting time for buses and scheduled transit vehicles." },
        { key: "p_wait_total", label: "Pedestrian Wait Total", color: "#6d28d9", unit: "s", definition: "Total waiting time accumulated by pedestrians at curbside crosswalks." },
      ],
    },
    {
      title: "Avg Wait Times",
      icon: "⏳",
      description: "The instantaneous average waiting time per road user. A primary indicator of active intersection level of service (LOS) and flow efficiency.",
      formula: "Wait_Avg = (∑ w_i) / N_active",
      metrics: [
        { key: "all_v_wait_avg", label: "All Vehicle Wait Avg", color: "#2563eb", unit: "s", definition: "Mean waiting time across the entire active vehicle population." },
        { key: "v_wait_avg", label: "Regular Vehicle Wait Avg", color: "#3b82f6", unit: "s", definition: "Mean waiting time for regular civilian traffic." },
        { key: "ev_wait_avg", label: "Emergency Vehicle Wait Avg", color: "#dc2626", unit: "s", definition: "Mean waiting time for emergency responders. Critical safety benchmark." },
        { key: "pt_wait_avg", label: "Public Transport Wait Avg", color: "#0f766e", unit: "s", definition: "Mean waiting time for public transit buses." },
        { key: "p_wait_avg", label: "Pedestrian Wait Avg", color: "#7c3aed", unit: "s", definition: "Mean waiting time for pedestrians currently at crosswalks." },
      ],
    },
    {
      title: "Max Wait Times",
      icon: "⚠️",
      description: "The absolute worst-case peak waiting time experienced by any single road user in the network. Isolates severe tail-end delay outliers and identifies localized starvation.",
      formula: "Wait_Max = max(w_1, w_2, ..., w_N)",
      metrics: [
        { key: "all_v_wait_max", label: "All Vehicle Wait Max", color: "#1e40af", unit: "s", definition: "Maximum delay recorded among all active vehicles." },
        { key: "v_wait_max", label: "Regular Vehicle Wait Max", color: "#1d4ed8", unit: "s", definition: "Maximum delay recorded for a regular passenger vehicle." },
        { key: "ev_wait_max", label: "Emergency Vehicle Wait Max", color: "#b91c1c", unit: "s", definition: "Maximum delay recorded for an emergency vehicle." },
        { key: "pt_wait_max", label: "Public Transport Wait Max", color: "#059669", unit: "s", definition: "Maximum delay recorded for a public transit bus." },
        { key: "p_wait_max", label: "Pedestrian Wait Max", color: "#6d28d9", unit: "s", definition: "Maximum delay recorded for a waiting pedestrian." },
      ],
    },
    {
      title: "Individual Experience Metrics",
      icon: "🔄",
      description: "Measures the complete end-to-end trip delay accumulated over the entire lifespan of a vehicle or pedestrian from insertion to exit.",
      formula: "Life_Avg = (∑ Trip_Delay_i) / N_completed",
      metrics: [
        { key: "v_life_avg", label: "All Vehicles Avg Trip Delay", color: "#2563eb", unit: "s", definition: "Average lifetime trip delay for all completed vehicle journeys." },
        { key: "reg_life_avg", label: "Regular Trip Delay", color: "#3b82f6", unit: "s", definition: "Average lifetime trip delay for civilian passenger trips." },
        { key: "ev_life_avg", label: "Emergency Trip Delay", color: "#ef4444", unit: "s", definition: "Average lifetime trip delay for emergency vehicle runs." },
        { key: "pt_life_avg", label: "Bus Trip Delay", color: "#0f766e", unit: "s", definition: "Average lifetime trip delay for completed bus routes." },
        { key: "p_life_avg", label: "Avg Delay Per Pedestrian", color: "#7c3aed", unit: "s", definition: "Average lifetime trip delay for completed pedestrian crossings." },
      ],
    },
    {
      title: "Efficiency Metrics",
      icon: "⚡",
      description: "Core operational efficiency indicators reflecting the macroscopic health of the traffic network and the smoothness of vehicle trajectories.",
      formula: "Throughput = ∑ Exit_Vehicles, Time_Loss = ∫ (1 - v/v_max) dt",
      metrics: [
        { key: "throughput", label: "System Throughput", color: "#059669", unit: "veh", definition: "Total cumulative count of vehicles successfully discharged through the intersection." },
        { key: "avg_time_loss", label: "Average Time Loss", color: "#7c3aed", unit: "s", definition: "Mean time lost by vehicles due to sub-optimal travel speeds below the speed limit." },
        { key: "total_vehicle_stops", label: "Total Vehicle Stops", color: "#475569", unit: "stops", definition: "Cumulative count of full vehicle stops (v < 0.1 m/s). Highly correlated with fuel waste and emissions." },
      ],
    },
    {
      title: "Vehicle Composition",
      icon: "📊",
      description: "Active breakdown of active road user population currently present within the simulation network.",
      formula: "N_total = N_car + N_truck + N_moto + N_bus + N_ev",
      metrics: [
        { key: "all_v_count", label: "All Vehicle Count", color: "#374151", unit: "veh", definition: "Total active vehicles currently in the simulation." },
        { key: "car_count", label: "Car Count", color: "#4b5563", unit: "veh", definition: "Active passenger cars." },
        { key: "motorcycle_count", label: "Motorcycle Count", color: "#60a5fa", unit: "veh", definition: "Active motorcycles." },
        { key: "truck_count", label: "Truck Count", color: "#f97316", unit: "veh", definition: "Active heavy freight trucks." },
        { key: "emergency_vehicle_count", label: "Emergency Vehicle Count", color: "#dc2626", unit: "veh", definition: "Active emergency responders." },
        { key: "pt_count", label: "Public Transport Count", color: "#0f766e", unit: "veh", definition: "Active public transit buses." },
        { key: "ped_total_count", label: "Pedestrian Presence", color: "#334155", unit: "ped", definition: "Active pedestrians on sidewalks and crosswalks." },
      ],
    },
    {
      title: "Flow And Utilization",
      icon: "🛣️",
      description: "Evaluates the spatial distribution of vehicles across available road lanes to identify structural lane imbalances.",
      formula: "Utilization = (∑ Lane_Density) / N_lanes",
      metrics: [
        { key: "lane_utilization", label: "Overall Lane Utilization", color: "#1d4ed8", unit: "ratio", definition: "Average balance of vehicle distribution across all intersection approaches." },
        { key: "ns_lane_utilization", label: "NS Lane Utilization", color: "#2563eb", unit: "ratio", definition: "Lane utilization balance specifically on North-South approaches." },
        { key: "ew_lane_utilization", label: "EW Lane Utilization", color: "#60a5fa", unit: "ratio", definition: "Lane utilization balance specifically on East-West approaches." },
      ],
    },
    {
      title: "Queue Metrics (Avg)",
      icon: "🛑",
      description: "The second-by-second average count of stopped vehicles (v < 0.1 m/s) forming physical queues at intersection stop lines.",
      formula: "Queue = ∑ I(v_i < 0.1 m/s)",
      metrics: [
        { key: "queue_total", label: "Total Queue", color: "#0891b2", unit: "veh", definition: "Combined average queue length across all approaches." },
        { key: "ns_queue", label: "North-South Queue", color: "#ea580c", unit: "veh", definition: "Average queue length on North-South approaches." },
        { key: "ew_queue", label: "East-West Queue", color: "#16a34a", unit: "veh", definition: "Average queue length on East-West approaches." },
      ],
    },
    {
      title: "Queue Metrics (Max)",
      icon: "🔥",
      description: "The peak physical queue lengths recorded during signal cycles. Crucial for detecting potential spillback into upstream intersections.",
      formula: "Max_Queue = max(Q(t))",
      metrics: [
        { key: "max_queue_length", label: "Peak Total Queue", color: "#b45309", unit: "veh", definition: "Absolute peak queue length observed across the entire intersection." },
        { key: "max_ns_queue", label: "Peak NS Queue", color: "#c2410c", unit: "veh", definition: "Peak queue length observed on North-South approaches." },
        { key: "max_ew_queue", label: "Peak EW Queue", color: "#15803d", unit: "veh", definition: "Peak queue length observed on East-West approaches." },
      ],
    },
    {
      title: "Congestion Metrics",
      icon: "🚨",
      description: "Advanced spatial and demand-based congestion indices measuring road storage saturation and capacity exhaustion.",
      formula: "Congestion_Spatial = Q / Storage_Cap, Congestion_Demand = Q / N_active",
      metrics: [
        { key: "congestion_level", label: "Spatial Congestion Intensity (Q/30)", color: "#be123c", unit: "level", definition: "Overall spatial saturation relative to road storage capacity." },
        { key: "ns_congestion", label: "NS Spatial Congestion (Q/30)", color: "#e11d48", unit: "level", definition: "Spatial saturation on North-South approaches." },
        { key: "ew_congestion", label: "EW Spatial Congestion (Q/30)", color: "#f43f5e", unit: "level", definition: "Spatial saturation on East-West approaches." },
        { key: "congestion_level_demand", label: "Demand Congestion Intensity (Q/N_active)", color: "#9f1239", unit: "level", definition: "Ratio of queued vehicles to total active demand." },
        { key: "ns_congestion_demand", label: "NS Demand Congestion (Q/N_active)", color: "#be123c", unit: "level", definition: "Demand congestion ratio on North-South approaches." },
        { key: "ew_congestion_demand", label: "EW Demand Congestion (Q/N_active)", color: "#e11d48", unit: "level", definition: "Demand congestion ratio on East-West approaches." },
      ],
    },
    {
      title: "Queue Dissipation Rates",
      icon: "🚀",
      description: "The physical discharge speed at which a stopped vehicle platoon clears the stop line once the signal turns green.",
      formula: "QDR = dQ / dt during green phase",
      metrics: [
        { key: "ns_qdr", label: "NS Dissipation Rate", color: "#0d9488", unit: "veh/s", definition: "Platoon discharge rate on North-South approaches." },
        { key: "ew_qdr", label: "EW Dissipation Rate", color: "#a16207", unit: "veh/s", definition: "Platoon discharge rate on East-West approaches." },
      ],
    },
    {
      title: "Adaptive Control",
      icon: "🎛️",
      description: "Internal state variables and decision thresholds governing the adaptive controller's phase-switching logic.",
      formula: "Switch triggered when Competing_Pressure > Threshold",
      metrics: [
        { key: "threshold", label: "Adaptive Threshold", color: "#1d4ed8", unit: "%", definition: "The dynamic mathematical cost barrier required to terminate the current active green phase." },
        { key: "preemption_events", label: "Preemption Active Time", color: "#eab308", unit: "s", definition: "Total active duration (s) where emergency preemption override was engaged." },
      ],
    },
    {
      title: "System Weights",
      icon: "⚖️",
      description: "Active mathematical pressure weights calculated by the controller for competing traffic axes.",
      formula: "Weight = Sigmoid(Queue_Density, Delay_Accumulation)",
      metrics: [
        { key: "ns_weight", label: "NS Priority Weight", color: "#be123c", unit: "weight", definition: "Active calculated demand weight for North-South approaches." },
        { key: "ew_weight", label: "EW Priority Weight", color: "#4338ca", unit: "weight", definition: "Active calculated demand weight for East-West approaches." },
      ],
    },
    {
      title: "Active Signal Phases",
      icon: "🚦",
      description: "Tracks the physical state and duration of the traffic light signals (Green, Yellow, Red) across both intersection axes.",
      formula: "Phase elapsed time tracked per state change",
      metrics: [
        { key: "ns_light", label: "North-South Signal Light", color: "#16a34a", unit: "state", definition: "Current physical signal state (Green, Yellow, Red) for North-South approaches." },
        { key: "ew_light", label: "East-West Signal Light", color: "#2563eb", unit: "state", definition: "Current physical signal state (Green, Yellow, Red) for East-West approaches." },
      ],
    },
    {
      title: "Controller Logic Flags",
      icon: "🚩",
      description: "Discrete binary state flags indicating active controller intervention modes such as preemption or starvation recovery.",
      formula: "Flag = 1 if intervention active, else 0",
      metrics: [
        { key: "event_starvation_active", label: "Recovery: Starvation Active", color: "#f59e42", unit: "bool", definition: "Flag indicating active intervention to flush a starved side-street." },
        { key: "event_preemption_active", label: "Recovery: Preemption Active", color: "#ef4444", unit: "bool", definition: "Flag indicating active emergency vehicle green hold." },
        { key: "event_recovery_active", label: "System Recovery Active (Combined)", color: "#10b981", unit: "bool", definition: "Combined binary flag indicating any active system recovery state." },
      ],
    },
    {
      title: "Preemption Analysis",
      icon: "🚑",
      description: "Detailed telemetry tracking the frequency, duration, and mechanical overrides executed during emergency vehicle preemption events.",
      formula: "Counts of holds, switches, and forced interruptions",
      metrics: [
        { key: "preemption_interruptions", label: "Preemption Interruptions", color: "#ef4444", unit: "count", definition: "Total signal cycles interrupted by emergency preemption." },
        { key: "preemption_holds", label: "Preemption Holds", color: "#f43f5e", unit: "count", definition: "Count of green phase extensions granted to clear approaching emergency vehicles." },
        { key: "preemption_force_switches", label: "Preemption Override Switches", color: "#ec4899", unit: "count", definition: "Count of immediate forced phase terminations to service emergency vehicles." },
      ],
    },
    {
      title: "Starvation Analysis",
      icon: "🥪",
      description: "Tracks the occurrence and duration of side-street starvation events where minor approaches exceed maximum waiting time limits.",
      formula: "Starvation triggered when Wait_Max > Starvation_Limit",
      metrics: [
        { key: "starvation_events", label: "Starvation Recovery Time", color: "#f59e42", unit: "s", definition: "Total active duration (s) spent in starvation recovery mode." },
        { key: "starvation_interruptions", label: "Starvation Interruptions", color: "#fb923c", unit: "count", definition: "Count of signal cycles altered to relieve side-street starvation." },
      ],
    },
    {
      title: "Environmental Impact",
      icon: "💨",
      description: "High-fidelity tailpipe emissions and fuel consumption metrics derived from microscopic vehicle trajectory models.",
      formula: "Emissions calculated via HBEFA3 / PHEMlight polynomial curves",
      metrics: [
        { key: "step_co2", label: "Emission Rate (CO₂)", color: "#059669", unit: "g/s", definition: "Instantaneous network-wide CO2 emission rate (g/s)." },
        { key: "total_co2", label: "Network Total CO₂", color: "#16a34a", unit: "g", definition: "Cumulative CO2 emitted across the entire simulation run (g)." },
        { key: "step_fuel", label: "Fuel Consumption", color: "#dc2626", unit: "g/s", definition: "Instantaneous network-wide fuel consumption rate (g/s)." },
        { key: "total_fuel", label: "Network Total Fuel", color: "#b91c1c", unit: "g", definition: "Cumulative fuel consumed across the entire simulation run (g)." },
      ],
    },
    {
      title: "Safety Analysis",
      icon: "🛡️",
      description: "Critical safety and sustainability metrics tracking collision events and pedestrian crossing efficiency.",
      formula: "Collisions logged via TraCI, Time saved relative to fixed baseline",
      metrics: [
        { key: "ped_collisions", label: "Safety Critical Events (Collisions)", color: "#f43f5e", unit: "count", definition: "Count of safety-critical conflicts or collisions involving pedestrians." },
        { key: "ped_time_saved", label: "Pedestrian Time Saved", color: "#1d4ed8", unit: "s", definition: "Cumulative pedestrian waiting time saved (s) by adaptive crosswalk intervention." },
      ],
    },
  ];

export default function SystemHelpPage() {
  const [activeTab, setActiveTab] = useState<"systems" | "fields" | "charts" | "telemetry" | "collection">("systems");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedSystemCategory, setSelectedSystemCategory] = useState<string>("core");
  const [selectedSystemLevel, setSelectedSystemLevel] = useState<string>("All");
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [activeCollectionTab, setActiveCollectionTab] = useState<string>("methodology");

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredSystems = useMemo(() => {
    const filtered = SYSTEMS_DATA.filter(sys => {
      const matchesSearch =
        sys.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sys.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sys.badge.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sys.mechanics.some(m => m.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory = sys.category === selectedSystemCategory;
      const matchesLevel = selectedSystemLevel === "All" || sys.level === selectedSystemLevel;

      return matchesSearch && matchesCategory && matchesLevel;
    });

    const levelWeight: Record<string, number> = { L1: 1, L2: 2, L3: 3 };
    return filtered.sort((a, b) => (levelWeight[a.level] || 99) - (levelWeight[b.level] || 99));
  }, [searchQuery, selectedSystemCategory, selectedSystemLevel]);

  const fieldCategories = useMemo(() => {
    const cats = new Set<string>();
    FIELDS_DATA.forEach(f => cats.add(f.category));
    return ["All", ...Array.from(cats)];
  }, []);

  const filteredFields = useMemo(() => {
    return FIELDS_DATA.filter(f => {
      const matchesSearch =
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.jsonPath.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.meaning.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.effect.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = selectedCategory === "All" || f.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const filteredCharts = useMemo(() => {
    return CHARTS_DATA.filter(c =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.section.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.whatItShows.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.howToCompare.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.proTip.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const filteredTelemetry = useMemo(() => {
    return TELEMETRY_DATA.filter(t =>
      t.variable.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.whatItShows.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.howToAnalyze.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.performanceIndicator.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-200 font-sans selection:bg-sky-500/30 pb-24">

      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-pink-900/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-sky-900/10 blur-[100px] rounded-full" />
        <div className="absolute bottom-[10%] left-[20%] w-[30%] h-[30%] bg-purple-900/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-10 space-y-10">

        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-lg mb-12 xl:flex-row xl:items-center xl:justify-between backdrop-blur-xl">
          <div className="flex items-center gap-4 min-w-0">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/30 text-white text-2xl font-bold flex items-center justify-center w-14 h-14 flex-shrink-0">
              📚
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight truncate">System Help Document</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 font-medium truncate">Comprehensive architectural guide, parameter dictionary.</p>
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
            <Link href="/traffic_charts" className="inline-flex items-center rounded-xl border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-indigo-800 dark:text-indigo-300 transition hover:bg-indigo-100 dark:hover:bg-indigo-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              📈 Traffic Charts
            </Link>
          </div>
        </header>

        <div className="flex flex-col gap-6 rounded-3xl border border-purple-300 dark:border-purple-800 bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 p-8 shadow-2xl text-white">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-5 text-2xl pointer-events-none text-white/50">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search across systems, json parameters, chart sections, or telemetry variables..."
              className="w-full pl-14 pr-6 py-4 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md text-white placeholder-white/50 text-base font-medium focus:outline-none focus:ring-4 focus:ring-purple-500/30 focus:border-purple-300 transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-5 text-white/50 hover:text-white text-sm font-bold transition"
              >
                ✕ Clear
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 p-2 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 shadow-inner">
            {[
              { id: "systems", label: "How Systems Work", icon: "🏛️", desc: "Architectural Deep Dive" },
              { id: "fields", label: "Control Hub Guide", icon: "🎛️", desc: "Parameter Dictionary" },
              { id: "charts", label: "Simulation Data Guide", icon: "📊", desc: "Chart Interpretation" },
              { id: "telemetry", label: "Traffic Charts Guide", icon: "📈", desc: "Time-Series Analytics" },
              { id: "collection", label: "Data Collection & Math", icon: "🧮", desc: "Methods & Formulas" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  if (tab.id !== "systems") {
                    setSelectedSystemId(null);
                  }
                }}
                className={`flex flex-col items-start p-4 rounded-xl font-semibold transition-all duration-300 text-left relative overflow-hidden ${activeTab === tab.id
                  ? "bg-white text-slate-900 shadow-xl border border-white/40 ring-2 ring-purple-400 scale-[1.02]"
                  : "bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
              >
                <div className="flex items-center gap-2.5 text-base">
                  <span className="text-xl">{tab.icon}</span>
                  <span className={`font-extrabold tracking-wide ${activeTab === tab.id ? "text-slate-900" : "text-white"}`}>{tab.label}</span>
                </div>
                <span className={`text-xs font-medium mt-1 pl-7 ${activeTab === tab.id ? "text-slate-600" : "text-white/50"}`}>{tab.desc}</span>
                {activeTab === tab.id && (
                  <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-purple-500 to-pink-500" />
                )}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "systems" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {selectedSystemId ? (
              (() => {
                const sys = SYSTEMS_DATA.find(s => s.id === selectedSystemId);
                if (!sys) return null;
                return (
                  <div className="space-y-10 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 p-8 sm:p-12 shadow-2xl animate-in fade-in zoom-in-95 duration-300">

                    <button
                      onClick={() => setSelectedSystemId(null)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-extrabold text-sm transition shadow-sm"
                    >
                      <span>←</span> Back to System Architecture Overview
                    </button>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800 pb-8 pt-2">
                      <div className="flex items-center gap-5">
                        <span className="text-5xl p-5 bg-slate-100 dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700/60 shadow-inner">
                          {sys.icon}
                        </span>
                        <div>
                          <span className="inline-block px-3.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800/50 text-sky-700 dark:text-sky-300 text-xs font-extrabold uppercase tracking-widest mb-2">
                            {sys.badge}
                          </span>
                          <h2 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-white tracking-tight">
                            {sys.title}
                          </h2>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 bg-gradient-to-r from-sky-500/10 to-indigo-500/10 dark:from-sky-900/20 dark:to-indigo-900/20 p-6 sm:p-8 rounded-2xl border border-sky-200/50 dark:border-sky-800/50 shadow-sm">
                      <h3 className="text-xs font-black uppercase tracking-widest text-sky-800 dark:text-sky-300 flex items-center gap-2">
                        <span>💡</span> System Executive Summary
                      </h3>
                      <p className="text-base text-slate-700 dark:text-slate-200 leading-relaxed font-semibold">
                        {sys.fullDetails?.overview || sys.description}
                      </p>
                    </div>

                    {sys.fullDetails?.formulas && sys.fullDetails.formulas.length > 0 && (
                      <div className="space-y-6">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                          <h3 className="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
                            <span>📐</span> Core Mathematical Models & Formulas
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Exact algorithmic equations governing state evaluation and decision boundaries.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-6">
                          {sys.fullDetails.formulas.map((form, idx) => (
                            <div key={idx} className="bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800/80 p-6 sm:p-8 space-y-6 shadow-sm">
                              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                                <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{form.name}</span>
                                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 font-mono">Formula {idx + 1}</span>
                              </div>

                              <div className="p-5 bg-slate-900 dark:bg-black rounded-xl border border-slate-700 dark:border-slate-800 shadow-inner font-mono text-center overflow-x-auto">
                                <span className="text-base sm:text-lg font-bold text-sky-300 tracking-wide select-all">{form.math}</span>
                              </div>

                              <div className="space-y-3">
                                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Variable Definitions</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {form.terms.map((term, tidx) => (
                                    <div key={tidx} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800/80 flex flex-col gap-1 shadow-sm">
                                      <span className="text-xs font-black text-sky-600 dark:text-sky-400 font-mono">{term.var}</span>
                                      <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{term.desc}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                                <span className="font-extrabold text-slate-500 dark:text-slate-400 uppercase mr-2 font-mono">Intuition:</span>
                                {form.explanation}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-6">
                      <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                        <h3 className="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
                          <span>🔄</span> Operational Mechanics & State Machine Workflow
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Step-by-step procedural execution cycle during each simulation micro-step.</p>
                      </div>
                      <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 pl-6 space-y-8 py-2">
                        {sys.fullDetails?.workflowSteps.map((step, idx) => (
                          <div key={idx} className="relative group">
                            <span className="absolute -left-[35px] top-1 w-6 h-6 rounded-full bg-white dark:bg-slate-900 border-2 border-sky-500 text-sky-500 dark:text-sky-400 font-bold text-xs flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                              {idx + 1}
                            </span>
                            <div className="space-y-1 bg-slate-50 dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-black text-slate-800 dark:text-white">{step.step}</span>
                                <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300">{step.title}</span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium pt-1">
                                {step.desc}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-5 bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
                        <h3 className="text-base font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                          <span>📦</span> Key Architecture Components
                        </h3>
                        <div className="space-y-3">
                          {sys.keyComponents.map((comp, idx) => (
                            <div key={idx} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1.5">
                              <span className="text-xs font-black text-indigo-800 dark:text-indigo-300 font-mono">{comp.name}</span>
                              <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{comp.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-5 bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
                        <h3 className="text-base font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 flex items-center gap-2">
                          <span>🔌</span> TraCI API Interactions
                        </h3>
                        <div className="space-y-3 font-mono text-xs">
                          {sys.fullDetails?.traciInteractions.map((act, idx) => {
                            const parts = act.split(":");
                            return (
                              <div key={idx} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5">
                                <div className="font-bold text-purple-700 dark:text-purple-300 break-all select-all">{parts[0]}</div>
                                <div className="text-slate-600 dark:text-slate-400 font-sans font-medium">{parts.slice(1).join(":")}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-5 bg-rose-50/50 dark:bg-rose-950/20 p-6 sm:p-8 rounded-2xl border border-rose-200 dark:border-rose-900/40 shadow-sm">
                        <h3 className="text-base font-black uppercase tracking-widest text-rose-800 dark:text-rose-400 flex items-center gap-2">
                          <span>🛡️</span> Fail-Safes, Guardrails & Edge Cases
                        </h3>
                        <div className="space-y-3">
                          {sys.fullDetails?.edgeCases.map((ec, idx) => (
                            <div key={idx} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-rose-100 dark:border-rose-900/40 shadow-sm space-y-1">
                              <span className="text-xs font-black text-rose-900 dark:text-rose-300">{ec.title}</span>
                              <p className="text-xs text-rose-700 dark:text-rose-300/80 leading-relaxed font-medium">{ec.desc}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-5 bg-amber-50/50 dark:bg-amber-950/20 p-6 sm:p-8 rounded-2xl border border-amber-200 dark:border-amber-900/40 shadow-sm">
                        <h3 className="text-base font-black uppercase tracking-widest text-amber-800 dark:text-amber-400 flex items-center gap-2">
                          <span>🔗</span> System Interdependencies
                        </h3>
                        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-900/40 shadow-sm">
                          <p className="text-sm text-amber-900 dark:text-amber-300 leading-relaxed font-semibold">
                            {sys.interdependencies}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <>
                <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
                      <span>🏛️</span> System Architecture & Operational Mechanics
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
                      Understand the underlying logic, core loops, and interdependencies of each sub-system within the traffic management suite.
                    </p>
                  </div>
                  <span className="px-4 py-1.5 rounded-full bg-purple-100 dark:bg-purple-900/40 border border-purple-300 dark:border-purple-800 text-purple-800 dark:text-purple-300 text-xs font-extrabold tracking-wider uppercase shadow-sm">
                    {filteredSystems.length} Systems Active
                  </span>
                </div>

                <div className="flex flex-col gap-6 p-8 bg-white/70 dark:bg-slate-900/60 backdrop-blur-2xl rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xl mb-8 transition-all">

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2 font-sans">
                        <span>📁</span> Functional Category Domain
                      </h3>
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700/60 shadow-inner">
                        {filteredSystems.length} Systems Active
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 p-2 bg-slate-200/60 dark:bg-slate-950/40 rounded-2xl border border-slate-300/60 dark:border-slate-800/80 shadow-inner">
                      {[
                        { id: "core", label: "Core Engine", icon: "🚦", desc: "Master Controllers" },
                        { id: "network", label: "Network Topology", icon: "🔀", desc: "Geometry & Ingestion" },
                        { id: "analytics", label: "Analytics Suite", icon: "🔬", desc: "Optimization & QDR" },
                        { id: "telemetry", label: "Telemetry I/O", icon: "📡", desc: "Data & Cloud Atlas" },
                        { id: "execution", label: "Execution CLI", icon: "🖥️", desc: "CLI & Path Resolvers" },
                      ].map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setSelectedSystemCategory(cat.id);

                            setSelectedSystemLevel("All");
                          }}
                          className={`flex flex-col items-start p-4 rounded-xl font-bold transition-all duration-300 relative overflow-hidden ${selectedSystemCategory === cat.id
                            ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xl border border-slate-200 dark:border-slate-700/80 ring-1 ring-sky-500/50 scale-[1.02]"
                            : "bg-transparent text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                        >
                          <div className="flex items-center gap-2.5 text-base font-extrabold tracking-wide">
                            <span className="text-lg">{cat.icon}</span>
                            <span>{cat.label}</span>
                          </div>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 pl-7 line-clamp-1">{cat.desc}</span>
                          {selectedSystemCategory === cat.id && (
                            <div className="absolute top-0 right-0 w-1.5 h-full bg-gradient-to-b from-sky-500 to-indigo-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start mb-8">

                  <div className="lg:col-span-1 flex flex-col gap-3 p-6 bg-white/70 dark:bg-slate-900/60 backdrop-blur-2xl rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xl sticky top-8 font-sans">
                    <div className="border-b border-slate-200/60 dark:border-slate-800/60 pb-4 mb-2">
                      <h3 className="text-xs font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 flex items-center gap-2 mb-1">
                        <span>⭐</span> Importance Dock
                      </h3>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Filter active domain by architectural execution priority layer.
                      </p>
                    </div>

                    {[
                      { id: "All", label: "🌐 All Tiers", badge: "Comprehensive", desc: "Display all active systems in scope" },
                      { id: "L1", label: "⭐ L1: Master Controllers", badge: "Primary", desc: "Executive orchestrators & main control loops" },
                      { id: "L2", label: "⚡ L2: Advanced Subsystems", badge: "Dedicated", desc: "Secondary engines & specialized tasks" },
                      { id: "L3", label: "⚙️ L3: Micro-Utilities", badge: "Foundation", desc: "Low-level utilities, I/O, & parsers" },
                    ].map((lvl) => (
                      <button
                        key={lvl.id}
                        onClick={() => setSelectedSystemLevel(lvl.id)}
                        className={`flex flex-col items-start p-4 rounded-2xl text-left transition-all duration-300 relative overflow-hidden shadow-sm ${selectedSystemLevel === lvl.id
                          ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-xl shadow-indigo-600/30 scale-[1.02] border-l-4 border-l-sky-400"
                          : "bg-white/50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-850 border border-slate-200/60 dark:border-slate-800/60"
                          }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1.5">
                          <span className="text-xs font-black tracking-wide">{lvl.label}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider ${selectedSystemLevel === lvl.id
                            ? "bg-indigo-800 text-indigo-100 border border-indigo-400/30"
                            : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40"
                            }`}>
                            {lvl.badge}
                          </span>
                        </div>
                        <span className={`text-[11px] line-clamp-2 font-medium ${selectedSystemLevel === lvl.id ? "text-indigo-100" : "text-slate-500 dark:text-slate-400"}`}>
                          {lvl.desc}
                        </span>
                      </button>
                    ))}

                    <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold">
                      <span>Active Scope:</span>
                      <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700">
                        {filteredSystems.length} matching
                      </span>
                    </div>
                  </div>

                  <div className="lg:col-span-3">
                    {filteredSystems.length === 0 ? (
                      <div className="p-12 text-center bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800">
                        <p className="text-lg text-slate-500 dark:text-slate-400 font-bold">No systems matched your search query.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {filteredSystems.map((sys) => {
                          const isExpanded = expandedItems[sys.id] ?? false;
                          return (
                            <div key={sys.id} className="flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-300 group">
                              <div
                                onClick={() => setSelectedSystemId(sys.id)}
                                className="p-8 pb-6 flex-1 space-y-6 cursor-pointer"
                              >
                                <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
                                  <div className="flex items-center gap-4">
                                    <span className="text-4xl p-4 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-inner group-hover:scale-110 transition-transform duration-300">
                                      {sys.icon}
                                    </span>
                                    <div>
                                      <h3 className="text-xl font-bold text-slate-800 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                        {sys.title}
                                      </h3>
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        <span className="px-3 py-1 rounded-lg bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800/50 text-sky-700 dark:text-sky-300 text-xs font-bold uppercase tracking-wider">
                                          {sys.badge}
                                        </span>
                                        <span className="px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800/50 text-purple-700 dark:text-purple-300 text-xs font-bold uppercase tracking-wider font-mono">
                                          📁 {sys.category}
                                        </span>
                                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase tracking-wider font-mono">
                                          ⭐ {sys.level}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-medium">
                                  {sys.description}
                                </p>

                                <div className="space-y-4 border-t border-slate-100 dark:border-slate-800/80 pt-6">
                                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                                    <span>⚙️</span> Operational Mechanics
                                  </h4>
                                  <ul className="space-y-3">
                                    {sys.mechanics.map((mech, idx) => (
                                      <li key={idx} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/40 font-medium">
                                        <span className="text-sky-500 font-bold mt-0.5">•</span>
                                        <span className="leading-relaxed">{mech}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                {isExpanded && (
                                  <div className="space-y-6 border-t border-slate-100 dark:border-slate-800/80 pt-6 animate-in fade-in duration-300">
                                    <div className="space-y-4">
                                      <h4 className="text-xs font-extrabold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 flex items-center gap-2">
                                        <span>📦</span> Key Architecture Components
                                      </h4>
                                      <div className="grid grid-cols-1 gap-3">
                                        {sys.keyComponents.map((comp, idx) => (
                                          <div key={idx} className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/40 flex flex-col gap-1">
                                            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 font-mono">{comp.name}</span>
                                            <span className="text-xs text-slate-600 dark:text-slate-300">{comp.desc}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:amber-900/40 space-y-1.5">
                                      <h4 className="text-xs font-extrabold uppercase tracking-widest text-amber-800 dark:text-amber-400 flex items-center gap-2">
                                        <span>🔗</span> Interdependencies
                                      </h4>
                                      <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed font-medium">
                                        {sys.interdependencies}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center flex flex-col sm:flex-row gap-2 justify-center items-center">
                                <button
                                  onClick={() => setSelectedSystemId(sys.id)}
                                  className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 w-full sm:w-auto flex items-center justify-center gap-2"
                                >
                                  <span>Explore Full System Deep-Dive & Formulas</span>
                                  <span>➔</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpand(sys.id);
                                  }}
                                  className="text-xs font-extrabold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center gap-1.5 w-full sm:w-auto py-2 px-4 transition-colors"
                                >
                                  <span>{isExpanded ? "Collapse Quick Overview" : "Expand Quick Overview"}</span>
                                  <span>{isExpanded ? "▲" : "▼"}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "fields" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
                  <span>🎛️</span> Control Hub Parameter Dictionary & Behavioral Impacts
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
                  A comprehensive breakdown of every configuration field, its JSON path, operational meaning, and the exact physical effect when modified.
                </p>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex-shrink-0">Filter:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-bold text-slate-800 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  {fieldCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {filteredFields.length === 0 ? (
              <div className="p-12 text-center bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800">
                <p className="text-lg text-slate-500 dark:text-slate-400 font-bold">No Control Hub fields matched your search or category filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {filteredFields.map((field) => (
                  <div key={field.id} className="flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-xl hover:shadow-2xl transition-all duration-300 p-8 space-y-6 group">
                    <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                      <div>
                        <span className="inline-block px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold uppercase tracking-wider mb-2">
                          {field.category}
                        </span>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {field.name}
                        </h3>
                        <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mt-1 select-all">
                          {field.jsonPath}
                        </p>
                      </div>

                      <span className={`px-3 py-1 rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-sm border ${field.impactLevel === "High"
                        ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/50"
                        : field.impactLevel === "Medium"
                          ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/50"
                          : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50"
                        }`}>
                        Impact: {field.impactLevel}
                      </span>
                    </div>

                    <div className="space-y-4 flex-1">
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                          <span>📖</span> What It Means
                        </h4>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                          {field.meaning}
                        </p>
                      </div>

                      {field.defaultValue && (
                        <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs font-medium text-slate-600 dark:text-slate-300">
                          <span className="font-extrabold uppercase text-slate-400 dark:text-slate-500">Default Value:</span>
                          <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{field.defaultValue}</span>
                        </div>
                      )}

                      <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-4">
                        <h4 className="text-xs font-extrabold uppercase tracking-widest text-sky-500 dark:text-sky-400 flex items-center gap-2">
                          <span>⚙️</span> What It Does (Controller Action)
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-sky-50/50 dark:bg-sky-950/20 p-3 rounded-xl border border-sky-100 dark:border-sky-900/30">
                          {field.action}
                        </p>
                      </div>

                      <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-4">
                        <h4 className="text-xs font-extrabold uppercase tracking-widest text-purple-500 dark:text-purple-400 flex items-center gap-2">
                          <span>⚡</span> Effect On System When Changed
                        </h4>
                        <p className="text-xs text-purple-950 dark:text-purple-200 leading-relaxed font-semibold bg-purple-50 dark:bg-purple-950/30 p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/50 shadow-inner">
                          {field.effect}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "charts" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
                  <span>📊</span> Simulation Data Chart Interpretation & Comparison Guide
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
                  Learn exactly what each chart and table in the Simulation Data dashboard represents, and how to effectively compare multi-mode benchmark results.
                </p>
              </div>
              <span className="px-4 py-1.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 border border-cyan-300 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 text-xs font-extrabold tracking-wider uppercase shadow-sm">
                {filteredCharts.length} Chart Sections Analyzed
              </span>
            </div>

            {filteredCharts.length === 0 ? (
              <div className="p-12 text-center bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800">
                <p className="text-lg text-slate-500 dark:text-slate-400 font-bold">No chart documentation matched your search query.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {filteredCharts.map((chart) => (
                  <div key={chart.id} className="flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-xl hover:shadow-2xl transition-all duration-300 p-8 space-y-6 group">
                    <div className="flex items-start gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                      <span className="text-4xl p-4 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-inner group-hover:scale-110 transition-transform duration-300">
                        {chart.icon}
                      </span>
                      <div>
                        <span className="inline-block px-3 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-800/50 text-cyan-700 dark:text-cyan-300 text-xs font-extrabold uppercase tracking-wider mb-2">
                          {chart.section}
                        </span>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                          {chart.title}
                        </h3>
                      </div>
                    </div>

                    <div className="space-y-6 flex-1">
                      <div className="space-y-2">
                        <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                          <span>📺</span> What The Chart Shows
                        </h4>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                          {chart.whatItShows}
                        </p>
                      </div>

                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-5">
                        <h4 className="text-xs font-extrabold uppercase tracking-widest text-cyan-500 dark:text-cyan-400 flex items-center gap-2">
                          <span>⚖️</span> How To Compare Results Using This Page
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-cyan-50/40 dark:bg-cyan-950/20 p-4 rounded-2xl border border-cyan-100 dark:border-cyan-900/30 shadow-inner">
                          {chart.howToCompare}
                        </p>
                      </div>

                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-5">
                        <h4 className="text-xs font-extrabold uppercase tracking-widest text-amber-500 dark:text-amber-400 flex items-center gap-2">
                          <span>💡</span> Expert Pro-Tip
                        </h4>
                        <p className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed font-semibold bg-amber-50 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 shadow-sm">
                          {chart.proTip}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "telemetry" && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
                  <span>📈</span> Traffic Charts Time-Series Analytics & Performance Evaluation
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
                  Master the interpretation of active telemetry variables, downsampling mechanics, and advanced analytical workflows to assess controller performance.
                </p>
              </div>
              <span className="px-4 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 text-xs font-extrabold tracking-wider uppercase shadow-sm">
                {filteredTelemetry.length} Telemetry Variables
              </span>
            </div>

            <div className="p-8 bg-gradient-to-br from-slate-900 to-indigo-950 dark:from-slate-900 dark:to-slate-950 text-white rounded-3xl border border-indigo-800/50 shadow-2xl space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />

              <div className="flex items-center gap-3">
                <span className="text-3xl">🔭</span>
                <h3 className="text-2xl font-extrabold tracking-tight">Active Telemetry & Downsampling Overview</h3>
              </div>

              <p className="text-slate-300 text-sm leading-relaxed font-medium max-w-4xl">
                The Traffic Charts dashboard provides high-resolution time-series data captured across the entire TraCI simulation lifespan. To maintain pristine browser rendering performance over multi-hour runs, the system employs an advanced <strong>Downsampling Precision Engine</strong>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-indigo-800/50">
                <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-2 backdrop-blur-md">
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-sky-400">Resolution Interval</h4>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    Adjusts the temporal step size (e.g., 1 second vs. 1 minute). Fine intervals show micro platoon shockwaves; coarse intervals highlight macro daily rush hour trends.
                  </p>
                </div>
                <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-2 backdrop-blur-md">
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-indigo-400">Max Samples (DS Precision)</h4>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    Sets the precise bucket count for the Largest Triangle Three Buckets (LTTB) downsampler. Guarantees visual peak preservation without DOM lag.
                  </p>
                </div>
                <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-2 backdrop-blur-md">
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-emerald-400">Multi-Mode Combination Builder</h4>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    Allows stacking multiple historical or active simulation runs onto the same timeline to perform direct visual gap analysis between Adaptive and Fixed modes.
                  </p>
                </div>
              </div>
            </div>

            {filteredTelemetry.length === 0 ? (
              <div className="p-12 text-center bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800">
                <p className="text-lg text-slate-500 dark:text-slate-400 font-bold">No telemetry variables matched your search query.</p>
              </div>
            ) : (
              <div className="space-y-8">
                <h3 className="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
                  <span>📊</span> Variable Output Dictionary & Analytical Workflows
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {filteredTelemetry.map((tel) => (
                    <div key={tel.id} className="flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-xl hover:shadow-2xl transition-all duration-300 p-8 space-y-6 group">
                      <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                        <div className="flex items-center gap-4">
                          <span className="text-4xl p-4 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-inner group-hover:scale-110 transition-transform duration-300">
                            {tel.icon}
                          </span>
                          <div>
                            <h4 className="text-xl font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {tel.variable}
                            </h4>
                            <span className="inline-block mt-1 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-mono font-bold tracking-wider">
                              Unit: {tel.unit}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-5 flex-1">
                        <div className="space-y-1.5">
                          <h5 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                            <span>📺</span> What The Variable Output Shows
                          </h5>
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                            {tel.whatItShows}
                          </p>
                        </div>

                        <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-4">
                          <h5 className="text-xs font-extrabold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 flex items-center gap-2">
                            <span>🔬</span> How To Analyze The Data
                          </h5>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-indigo-50/40 dark:bg-indigo-950/20 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/30 shadow-inner">
                            {tel.howToAnalyze}
                          </p>
                        </div>

                        <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-4">
                          <h5 className="text-xs font-extrabold uppercase tracking-widest text-emerald-500 dark:text-emerald-400 flex items-center gap-2">
                            <span>🎯</span> Performance Indicator & Flow Assessment
                          </h5>
                          <p className="text-xs text-emerald-950 dark:text-emerald-200 leading-relaxed font-semibold bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm">
                            {tel.performanceIndicator}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <h3 className="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
                  <span>🧠</span> Advanced Analytical Workflows: Evaluating System Performance
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                  Combine multiple chart variables to perform professional traffic engineering evaluations.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <span>1️⃣</span> Platoon Flushing & Zero-Waste Verification
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    Overlay <strong>Queue Lengths</strong> with <strong>Signal Light Status</strong> (green/red background bands). In a perfectly tuned adaptive system, the green phase should initiate exactly as the queue curve hits its peak. The green phase should terminate the exact second the queue curve touches zero. If the green band continues while the queue remains at zero, the <em>Zero-Waste Multiplier</em> in Control Hub should be increased.
                  </p>
                </div>

                <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <span>2️⃣</span> Preemption Impact & Stabilization Hysteresis
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    Locate an <strong>EV Preemption Event Marker</strong> on the timeline. Observe the opposing street's Queue Length curve immediately following the event. Measure the time elapsed from the end of preemption until the opposing queue returns to its normal pre-event baseline. This duration represents the <em>Stabilization Time</em>. If recovery takes longer than 120 seconds, increase the <em>Recovery Bonus</em> in Control Hub.
                  </p>
                </div>

                <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <span>3️⃣</span> Multi-Goal Trade-off Analysis
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    Use the <strong>Mode Selection Builder</strong> to overlay an <em>Eco-Optimized</em> profile against a <em>Throughput-Optimized</em> profile. Plot <strong>Throughput</strong> on the left Y-axis and <strong>CO2 Emission Rate</strong> on the right Y-axis. You can visually identify the exact trade-off threshold where maximizing raw vehicle throughput begins to cause exponential carbon emission penalties due to platoon fragmentation.
                  </p>
                </div>

                <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <span>4️⃣</span> Spillback Gridlock Detection
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    Plot <strong>Congestion Intensity</strong> alongside <strong>Average Delay</strong>. If Congestion Intensity reaches 1.0 (indicating vehicle queues have filled the entire observable road length), watch for a corresponding plateau in Throughput and a vertical explosion in Average Delay. This confirms intersection spillback locking. To resolve this, activate <em>Center Area Collision Logic</em> and tighten <em>Dynamic Max Red Limits</em> in Control Hub.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "collection" && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="space-y-8 pt-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
                    <span>📈</span> Traffic Charts Variables & Analytics Dictionary
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
                    Comprehensive definitions, mathematical formulas, and analytical groupings for all 38 variables plotted in the Traffic Charts time-series dashboard, including core TraCI polling methodologies.
                  </p>
                </div>
                <span className="px-4 py-1.5 rounded-full bg-sky-100 dark:bg-sky-900/40 border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-xs font-extrabold tracking-wider uppercase shadow-sm">
                  6 Main Categories
                </span>
              </div>

              <div className="flex flex-col lg:flex-row gap-8">

                <div className="lg:w-64 flex-shrink-0 space-y-1.5">
                  <p className="px-4 mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    Metric Categories
                  </p>
                  {COLLECTION_METRIC_SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setActiveCollectionTab(section.id)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all group ${activeCollectionTab === section.id
                        ? "bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 shadow-sm shadow-sky-500/5"
                        : "bg-transparent border border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                        }`}
                    >
                      <span className={`font-bold text-xs uppercase tracking-widest transition-transform duration-300 ${activeCollectionTab === section.id ? "translate-x-1" : "group-hover:translate-x-1"}`}>
                        {section.title}
                      </span>
                      {activeCollectionTab === section.id && (
                        <div className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 min-h-[400px]">
                  {COLLECTION_METRIC_SECTIONS.filter(s => s.id === activeCollectionTab).map((section) => (
                    <div key={section.id} className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="mb-6 flex flex-col gap-1 border-l-2 border-sky-500 pl-4">
                        <h4 className="text-base font-bold uppercase tracking-[0.15em] text-slate-800 dark:text-slate-200">
                          {section.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {section.subtitle}
                        </p>
                      </div>

                      {section.id === "methodology" ? (
                        <div className="space-y-8">

                          <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-xl space-y-6 hover:shadow-2xl transition-all duration-300">
                            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                              <div className="flex items-center gap-4">
                                <span className="text-4xl p-4 bg-sky-50 dark:bg-sky-950/40 rounded-2xl border border-sky-200 dark:border-sky-800/50 shadow-inner">
                                  🏎️
                                </span>
                                <div>
                                  <span className="inline-block px-3 py-1 rounded-lg bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800/50 text-sky-700 dark:text-sky-300 text-xs font-extrabold uppercase tracking-wider mb-2">
                                    Methodology 01 • Instantaneous Polling
                                  </span>
                                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                                    Vehicle Kinematics & Induction Loop Emulation (E1 / E2 / E3)
                                  </h3>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                  📡 TraCI Ingestion Method
                                </h4>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                  The simulation engine establishes a high-frequency TCP synchronous loop with the SUMO kernel via `traci.vehicle.getSpeed()`, `traci.edge.getLastStepHaltingNumber()`, and virtual induction loops (E1/E2/E3). Data is polled at every active simulation delta (Δt = 1.0s).
                                </p>
                              </div>
                              <div className="space-y-2 bg-sky-50/50 dark:bg-sky-950/20 p-5 rounded-2xl border border-sky-100 dark:border-sky-900/30 shadow-inner">
                                <h4 className="text-xs font-extrabold uppercase tracking-widest text-sky-600 dark:text-sky-400">
                                  🧮 Mathematical Formulas
                                </h4>
                                <div className="space-y-3 font-mono text-xs text-sky-950 dark:text-sky-200">
                                  <div>
                                    <span className="font-bold text-sky-700 dark:text-sky-300">Instantaneous Acceleration:</span>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-sky-200 dark:border-sky-800/50 mt-1 overflow-x-auto">
                                      a_i(t) = [v_i(t) - v_i(t - Δt)] / Δt
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-bold text-sky-700 dark:text-sky-300">Approach Delay / Time Loss:</span>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-sky-200 dark:border-sky-800/50 mt-1 overflow-x-auto">
                                      D_i = ∫ [1 - (v_i(t) / v_max)] dt, for v_i(t) &lt; v_max
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-xl space-y-6 hover:shadow-2xl transition-all duration-300">
                            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                              <div className="flex items-center gap-4">
                                <span className="text-4xl p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800/50 shadow-inner">
                                  🌱
                                </span>
                                <div>
                                  <span className="inline-block px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold uppercase tracking-wider mb-2">
                                    Methodology 02 • Micro-Emission Modeling
                                  </span>
                                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                                    Environmental & Emissions Calculation (HBEFA3 / PHEMlight)
                                  </h3>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                  📡 TraCI Ingestion Method
                                </h4>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                  Continuous polling of `traci.vehicle.getCO2Emission()` and `traci.vehicle.getFuelConsumption()` across all active vehicle IDs. The backend maps vehicle emission classes (e.g., Euro 6 Diesel, BEV) to continuous polynomial power curves derived from the HBEFA3 database.
                                </p>
                              </div>
                              <div className="space-y-2 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 shadow-inner">
                                <h4 className="text-xs font-extrabold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                                  🧮 Mathematical Formulas
                                </h4>
                                <div className="space-y-3 font-mono text-xs text-emerald-950 dark:text-emerald-200">
                                  <div>
                                    <span className="font-bold text-emerald-700 dark:text-emerald-300">Kinematic Power Consumption:</span>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/50 mt-1 overflow-x-auto">
                                      P_i(t) = [m_i · a_i(t) + F_roll + F_air(v_i(t)^2)] · v_i(t)
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-bold text-emerald-700 dark:text-emerald-300">Total Greenhouse Gas Rate:</span>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/50 mt-1 overflow-x-auto">
                                      E_CO2(t) = ∑ [c_0 + c_1·v_i(t) + c_2·a_i(t) + c_3·v_i(t)·a_i(t)]
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-xl space-y-6 hover:shadow-2xl transition-all duration-300">
                            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                              <div className="flex items-center gap-4">
                                <span className="text-4xl p-4 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800/50 shadow-inner">
                                  🛑
                                </span>
                                <div>
                                  <span className="inline-block px-3 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 text-xs font-extrabold uppercase tracking-wider mb-2">
                                    Methodology 03 • Spatial Aggregation
                                  </span>
                                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                                    Queue Length & Platoon Shockwave Tracking
                                  </h3>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                  📡 TraCI Ingestion Method
                                </h4>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                  Aggregates spatial edge data via `traci.edge.getLastStepHaltingNumber()` and `traci.lane.getLastStepLength()`. A vehicle is classified as "queued" if its velocity drops below the halting threshold (v_i &lt; 0.1 m/s).
                                </p>
                              </div>
                              <div className="space-y-2 bg-amber-50/50 dark:bg-amber-950/20 p-5 rounded-2xl border border-amber-100 dark:border-amber-900/30 shadow-inner">
                                <h4 className="text-xs font-extrabold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                                  🧮 Mathematical Formulas
                                </h4>
                                <div className="space-y-3 font-mono text-xs text-amber-950 dark:text-amber-200">
                                  <div>
                                    <span className="font-bold text-amber-700 dark:text-amber-300">Halting Queue Accumulation:</span>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/50 mt-1 overflow-x-auto">
                                      Q_lane(t) = ∑ I(v_i(t) &lt; 0.1 m/s), for all i ∈ lane
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-bold text-amber-700 dark:text-amber-300">Spatial Congestion Ratio:</span>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/50 mt-1 overflow-x-auto">
                                      C_ratio(t) = [Q_lane(t) · len_veh] / len_lane_storage
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-xl space-y-6 hover:shadow-2xl transition-all duration-300">
                            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                              <div className="flex items-center gap-4">
                                <span className="text-4xl p-4 bg-purple-50 dark:bg-purple-950/40 rounded-2xl border border-purple-200 dark:border-purple-800/50 shadow-inner">
                                  🚶
                                </span>
                                <div>
                                  <span className="inline-block px-3 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800/50 text-purple-700 dark:text-purple-300 text-xs font-extrabold uppercase tracking-wider mb-2">
                                    Methodology 04 • Multi-Modal Telemetry
                                  </span>
                                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                                    Pedestrian Telemetry & Active Transport Ingestion
                                  </h3>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                  📡 TraCI Ingestion Method
                                </h4>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                  Direct polling of `traci.person.getStage()` and `traci.person.getWaitingTime()`. The system separates active walking stages from waiting stages at crosswalk boundaries to evaluate pedestrian starvation metrics.
                                </p>
                              </div>
                              <div className="space-y-2 bg-purple-50/50 dark:bg-purple-950/20 p-5 rounded-2xl border border-purple-100 dark:border-purple-900/30 shadow-inner">
                                <h4 className="text-xs font-extrabold uppercase tracking-widest text-purple-600 dark:text-purple-400">
                                  🧮 Mathematical Formulas
                                </h4>
                                <div className="space-y-3 font-mono text-xs text-purple-950 dark:text-purple-200">
                                  <div>
                                    <span className="font-bold text-purple-700 dark:text-purple-300">Cumulative Crosswalk Waiting:</span>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-purple-200 dark:border-purple-800/50 mt-1 overflow-x-auto">
                                      W_ped(t) = ∑ ∫ I(stage_p(t) == WAITING) dt, for all p ∈ crosswalk
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-bold text-purple-700 dark:text-purple-300">Pedestrian Starvation Penalty:</span>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-purple-200 dark:border-purple-800/50 mt-1 overflow-x-auto">
                                      P_starv = max(0, W_ped(t) - W_threshold)^1.5
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-xl space-y-6 hover:shadow-2xl transition-all duration-300">
                            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                              <div className="flex items-center gap-4">
                                <span className="text-4xl p-4 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-800/50 shadow-inner">
                                  📉
                                </span>
                                <div>
                                  <span className="inline-block px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold uppercase tracking-wider mb-2">
                                    Methodology 05 • LTTB Algorithm
                                  </span>
                                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                                    Downsampling Precision Engine (Largest Triangle Three Buckets)
                                  </h3>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                  📡 Algorithmic Execution
                                </h4>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                  To render tens of thousands of time-series data points without browser DOM lag, the engine applies the LTTB algorithm. It divides the time-series into equal buckets and selects exactly one point per bucket that maximizes the effective triangle area with the previous and next buckets, guaranteeing visual peak preservation.
                                </p>
                              </div>
                              <div className="space-y-2 bg-indigo-50/50 dark:bg-indigo-950/20 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 shadow-inner">
                                <h4 className="text-xs font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                                  🧮 Mathematical Formulas
                                </h4>
                                <div className="space-y-3 font-mono text-xs text-indigo-950 dark:text-indigo-200">
                                  <div>
                                    <span className="font-bold text-indigo-700 dark:text-indigo-300">Effective Triangle Area Maximization:</span>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800/50 mt-1 overflow-x-auto">
                                      Area = 0.5 · |x_A(y_B - y_C) + x_B(y_C - y_A) + x_C(y_A - y_B)|
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-bold text-indigo-700 dark:text-indigo-300">Bucket Indexing Selection:</span>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800/50 mt-1 overflow-x-auto">
                                      Selected Point B = argmax_[B ∈ Bucket] (Area(A, B, Avg(Next_Bucket)))
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-8">
                          {section.groups.map((groupTitle) => {
                            const group = COLLECTION_METRIC_GROUPS.find((g) => g.title === groupTitle);
                            if (!group) return null;

                            return (
                              <div key={group.title} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-xl hover:shadow-2xl transition-all duration-300 p-8 space-y-6 group/card">
                                <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                                  <div className="flex items-center gap-4">
                                    <span className="text-4xl p-4 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-inner group-hover/card:scale-110 transition-transform duration-300">
                                      {group.icon}
                                    </span>
                                    <div>
                                      <h5 className="text-xl font-bold text-slate-800 dark:text-white group-hover/card:text-sky-600 dark:group-hover/card:text-sky-400 transition-colors">
                                        {group.title}
                                      </h5>
                                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium max-w-2xl">
                                        {group.description}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-5">
                                  <div className="space-y-2 bg-sky-50/40 dark:bg-sky-950/20 p-4 rounded-2xl border border-sky-100 dark:border-sky-900/30 shadow-inner">
                                    <h6 className="text-xs font-extrabold uppercase tracking-widest text-sky-600 dark:text-sky-400 flex items-center gap-2">
                                      <span>🧮</span> Group Aggregation Formula
                                    </h6>
                                    <div className="font-mono text-xs text-sky-950 dark:text-sky-200 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-sky-200 dark:border-sky-800/50 overflow-x-auto">
                                      {group.formula}
                                    </div>
                                  </div>

                                  <div className="space-y-3 pt-2">
                                    <h6 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                                      <span>📋</span> Group Variables & Definitions
                                    </h6>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {group.metrics.map((metric) => (
                                        <div key={metric.key} className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 flex flex-col justify-between space-y-2 hover:border-sky-300 dark:hover:border-sky-700 transition-colors">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                              <div
                                                className="h-2.5 w-2.5 rounded-full shadow-[0_0_8px_currentColor] flex-shrink-0"
                                                style={{ backgroundColor: metric.color, color: metric.color }}
                                              />
                                              <span className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate" title={metric.label}>
                                                {metric.label}
                                              </span>
                                            </div>
                                            <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[10px] font-bold tracking-wider uppercase flex-shrink-0">
                                              {metric.unit}
                                            </span>
                                          </div>
                                          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                                            {metric.definition}
                                          </p>
                                          <div className="pt-1 text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate" title={metric.key}>
                                            Key: {metric.key}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

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
