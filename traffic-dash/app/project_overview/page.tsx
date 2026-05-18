"use client";

import React, { useState } from "react";
import Link from "next/link";
import ThemeToggle from "../_components/ThemeToggle";

interface WorkflowStep {
  id: string;
  phase: string;
  title: string;
  icon: string;
  tech: string;
  description: string;
  details: string[];
  color: string;
  bgLight: string;
  bgDark: string;
  borderLight: string;
  borderDark: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: "step-1",
    phase: "Phase 01 • IoT Edge Capture",
    title: "Raspberry Pi Continuous Video Streaming",
    icon: "📹",
    tech: "Raspberry Pi 5 / Camera Module 3 / AWS IoT",
    description: "A dedicated Raspberry Pi hardware unit deployed at the physical intersection continuously captures high-definition video footage of live traffic conditions and securely buffers/uploads the streams to cloud storage.",
    details: [
      "Hardware Encoding: H.265 hardware-accelerated video compression ensures minimal bandwidth consumption during continuous streaming.",
      "Edge Buffering: Local SD/NVMe ring buffer prevents footage loss during intermittent cellular or Wi-Fi network disruptions.",
      "Secure Cloud Ingestion: Automated MQTT/HTTPS payloads push encrypted video chunks directly to secure cloud staging buckets."
    ],
    color: "#ec4899",
    bgLight: "bg-pink-50/50",
    bgDark: "dark:bg-pink-950/20",
    borderLight: "border-pink-200",
    borderDark: "dark:border-pink-900/30",
  },
  {
    id: "step-2",
    phase: "Phase 02 • AI Computer Vision",
    title: "YOLO Neural Network Telemetry Extraction",
    icon: "🧠",
    tech: "YOLOv11 / PyTorch / CUDA TensorRT",
    description: "A cloud-based AI inference engine downloads the video streams and processes them through an advanced YOLO object detection pipeline to extract precise multi-modal traffic metrics.",
    details: [
      "Multi-Class Detection: Identifies and classifies passenger vehicles, buses, transport trucks, pedestrians, and emergency vehicles with high confidence.",
      "Trajectory & Speed Estimation: Tracks frame-to-frame bounding box centroids to calculate instantaneous approach velocities and directional vectors.",
      "Virtual Induction Loops: Emulates physical E1/E2/E3 detector loops across user-defined spatial coordinates within the camera field of view."
    ],
    color: "#a855f7",
    bgLight: "bg-purple-50/50",
    bgDark: "dark:bg-purple-950/20",
    borderLight: "border-purple-200",
    borderDark: "dark:border-purple-900/30",
  },
  {
    id: "step-3",
    phase: "Phase 03 • Centralized Storage",
    title: "MongoDB Atlas Cloud Telemetry Lake",
    icon: "☁️",
    tech: "MongoDB Atlas / Time-Series Collections",
    description: "Extracted traffic metrics (vehicle counts, pedestrian accumulations, queue lengths, average approach speeds) are securely ingested into MongoDB Atlas, creating a highly structured time-series data lake.",
    details: [
      "Time-Series Optimization: Utilizes MongoDB's native time-series collections for high-throughput ingestion and optimal storage compression.",
      "Granular Indexing: Compound indexing on timestamp, intersection ID, and vehicle class enables sub-millisecond retrieval during simulation queries.",
      "Cloud Persistence: Serves as the immutable historical baseline for all subsequent simulation sweeps, audit trails, and machine learning training."
    ],
    color: "#06b6d4",
    bgLight: "bg-cyan-50/50",
    bgDark: "dark:bg-cyan-950/20",
    borderLight: "border-cyan-200",
    borderDark: "dark:border-cyan-900/30",
  },
  {
    id: "step-4",
    phase: "Phase 04 • Digital Twin Orchestration",
    title: "SUMO Simulation & Multi-Goal Optimization",
    icon: "🚦",
    tech: "SUMO / TraCI / Python Optimizer / Next.js",
    description: "The Next.js web dashboard downloads the real-world telemetry from MongoDB Atlas to initialize a high-fidelity SUMO traffic simulation. Users can manually tune adaptive controller weights or launch automated multi-goal optimization sweeps.",
    details: [
      "Digital Twin Ingestion: Populates the virtual junction geometry and traffic demand tables directly from cloud database records.",
      "Manual Calibration Hub: Allows traffic engineers to adjust phase retention bonuses, starvation thresholds, and EV preemption policies for simulation sweeps.",
      "Rapid Grid Search Optimizer: Automates hundreds of simulation sweeps across diverse objective functions (Eco, Throughput, Pedestrian Focus, Low Congestion)."
    ],
    color: "#3b82f6",
    bgLight: "bg-blue-50/50",
    bgDark: "dark:bg-blue-950/20",
    borderLight: "border-blue-200",
    borderDark: "dark:border-blue-900/30",
  },
  {
    id: "step-5",
    phase: "Phase 05 • Analytics & Persistence",
    title: "Trade-off Analytics & Atlas Result Archiving",
    icon: "📊",
    tech: "LTTB Downsampling / Radar Matrices / Atlas Archival",
    description: "Advanced analytical charts visualize multi-goal trade-offs to identify the absolute apex optimal adaptive solution. Finalized simulation outputs and optimal tuning profiles can be saved back to MongoDB Atlas for future retrieval.",
    details: [
      "Multi-Goal Matrix: Evaluates 48 distinct operating modes against baseline performance to score and highlight the apex winner.",
      "LTTB Precision Charts: Renders tens of thousands of time-series data points without browser lag while preserving critical congestion peaks.",
      "Cloud Archival: Persists optimal controller configurations and simulation telemetry back to MongoDB Atlas for continuous deployment and long-term retrieval."
    ],
    color: "#10b981",
    bgLight: "bg-emerald-50/50",
    bgDark: "dark:bg-emerald-950/20",
    borderLight: "border-emerald-200",
    borderDark: "dark:border-emerald-900/30",
  }
];

const ARCHITECTURE_LAYERS = [
  { layer: "IoT Edge Hardware", tech: "Raspberry Pi 5, Pi Camera Module", role: "Physical traffic video capture." },
  { layer: "AI Vision Pipeline", tech: "YOLOv11, PyTorch, OpenCV", role: "Object detection, classification, speed estimation, & counting." },
  { layer: "Cloud Database", tech: "MongoDB Atlas (Time-Series Collections), Mongoose", role: "Historical data storage, & profile storage." },
  { layer: "Simulation Engine", tech: "Eclipse SUMO (Simulation of Urban MObility), TraCI API", role: "Microscopic traffic emulation, & kinematic modeling." },
  { layer: "Optimization Core", tech: "Python, Numpy, Scipy, Rapid Grid Search Engine", role: "Multi-goal hyperparameter tuning, & cost evaluation." },
  { layer: "Web Interface", tech: "Next.js, React, D3.js", role: "Interactive Control Hub and time-series visualization." },
];

export default function ProjectOverviewPage() {
  const [activeStepId, setActiveStepId] = useState<string>("step-1");
  const [activeSimulatedClass, setActiveSimulatedClass] = useState<string>("All");
  const [isPlayingDemo, setIsPlayingDemo] = useState<boolean>(true);

  const simulatedDetections = [
    { id: 1, class: "Car", conf: "0.94", box: "x: 142, y: 310, w: 85, h: 45", speed: "42.5 km/h", color: "#3b82f6" },
    { id: 2, class: "Pedestrian", conf: "0.89", box: "x: 610, y: 180, w: 25, h: 65", speed: "4.2 km/h", color: "#a855f7" },
    { id: 3, class: "Bus", conf: "0.97", box: "x: 280, y: 420, w: 140, h: 80", speed: "35.0 km/h", color: "#eab308" },
    { id: 4, class: "Car", conf: "0.91", box: "x: 520, y: 340, w: 75, h: 40", speed: "48.1 km/h", color: "#3b82f6" },
    { id: 5, class: "Emergency", conf: "0.95", box: "x: 390, y: 510, w: 95, h: 55", speed: "65.3 km/h", color: "#ef4444" },
    { id: 6, class: "Pedestrian", conf: "0.86", box: "x: 640, y: 195, w: 22, h: 62", speed: "3.8 km/h", color: "#a855f7" },
  ];

  const filteredDetections = activeSimulatedClass === "All"
    ? simulatedDetections
    : simulatedDetections.filter(d => d.class === activeSimulatedClass);

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
              🚀
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight truncate">Project Overview</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 font-medium truncate">IoT Edge Capture, AI Computer Vision, & Cloud Simulation Twin.</p>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-2.5 items-center flex-shrink-0 overflow-x-auto py-1 max-w-full">
            <ThemeToggle />
            <Link href="/simulation_dashboard" className="inline-flex items-center rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-sky-800 dark:text-sky-300 transition hover:bg-sky-100 dark:hover:bg-sky-900/50 shadow-sm hover:shadow whitespace-nowrap flex-shrink-0">
              🎛️ Control Hub
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

        <div className="relative rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 p-8 md:p-12 shadow-2xl backdrop-blur-2xl mb-12 overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-sky-500/10 blur-3xl rounded-full pointer-events-none" />

          <div className="max-w-4xl space-y-6 relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-sky-500/10 border border-purple-300/50 dark:border-purple-700/50 text-purple-800 dark:text-purple-300 text-xs font-extrabold uppercase tracking-widest shadow-sm">
              <span>✨</span> End-to-End Autonomous Traffic Pipeline
            </div>

            <h2 className="text-3xl md:text-5xl font-black text-slate-800 dark:text-white tracking-tight leading-tight">
              Bridging Physical Intersections with Cloud AI & Simulation Digital Twins.
            </h2>

            <p className="text-base md:text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              Our advanced traffic management suite establishes an automated, closed-loop pipeline between real-world roadways and high-performance cloud simulation. By pairing lightweight IoT edge hardware with state-of-the-art neural networks and microscopic digital twin modeling, we empower cities to dynamically analyze, optimize, and archive traffic signaling strategies.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
              {[
                { label: "IoT Edge Hardware", value: "Raspberry Pi 5", icon: "📹" },
                { label: "AI Computer Vision", value: "YOLOv11 Engine", icon: "🧠" },
                { label: "Cloud Telemetry Lake", value: "MongoDB Atlas", icon: "☁️" },
                { label: "Simulation & Tuning", value: "SUMO Digital Twin", icon: "🚦" }
              ].map((stat, idx) => (
                <div key={idx} className="p-4 bg-white/80 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm flex flex-col justify-between space-y-2">
                  <div className="text-2xl">{stat.icon}</div>
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.label}</div>
                    <div className="text-base font-extrabold text-slate-800 dark:text-white mt-0.5">{stat.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-8 mb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div>
              <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
                <span>🔄</span> Architectural Workflow: From Physical Roadway to Cloud twin
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
                Explore the 5 interconnected phases that power our continuous traffic ingestion, AI processing, simulation, and cloud archival pipeline.
              </p>
            </div>
            <span className="px-4 py-1.5 rounded-full bg-purple-100 dark:bg-purple-900/40 border border-purple-300 dark:border-purple-800 text-purple-800 dark:text-purple-300 text-xs font-extrabold tracking-wider uppercase shadow-sm">
              5 Sequential Phases
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            <div className="lg:col-span-4 space-y-3 font-sans">
              {WORKFLOW_STEPS.map((step) => {
                const isActive = activeStepId === step.id;
                return (
                  <button
                    key={step.id}
                    onClick={() => setActiveStepId(step.id)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all flex items-start gap-4 group ${isActive
                      ? `bg-white dark:bg-slate-900 shadow-xl border-l-4 ${step.borderLight} ${step.borderDark} scale-[1.02]`
                      : "bg-white/40 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900/60"
                      }`}
                  >
                    <span className="text-3xl p-3 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                      {step.icon}
                    </span>
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        {step.phase}
                      </div>
                      <h4 className={`text-base font-bold truncate ${isActive ? "text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-300"}`}>
                        {step.title}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed font-medium">
                        {step.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-8">
              {WORKFLOW_STEPS.filter(s => s.id === activeStepId).map((step) => (
                <div key={step.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-8 md:p-10 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
                    <div className="flex items-center gap-4">
                      <span className="text-5xl p-5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner">
                        {step.icon}
                      </span>
                      <div>
                        <span className="inline-block px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold uppercase tracking-wider mb-2">
                          {step.phase}
                        </span>
                        <h4 className="text-2xl font-extrabold text-slate-800 dark:text-white">
                          {step.title}
                        </h4>
                        <p className="text-xs font-mono text-purple-600 dark:text-purple-400 font-bold mt-1">
                          Core Technology: {step.tech}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h5 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                        <span>📋</span> Phase Overview
                      </h5>
                      <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed font-medium bg-slate-50 dark:bg-slate-800/40 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/50">
                        {step.description}
                      </p>
                    </div>

                    <div className="space-y-4 pt-2">
                      <h5 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                        <span>⚙️</span> Architectural Capabilities & Execution
                      </h5>
                      <div className="grid grid-cols-1 gap-4">
                        {step.details.map((detail, idx) => {
                          const [title, desc] = detail.split(": ");
                          return (
                            <div key={idx} className={`p-5 rounded-2xl border ${step.borderLight} ${step.borderDark} ${step.bgLight} ${step.bgDark} flex flex-col space-y-1 shadow-sm`}>
                              <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: step.color }} />
                                {title}
                              </span>
                              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed pl-4">
                                {desc}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-8 mb-16 pt-8 border-t border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div>
              <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
                <span>🤖</span> AI Computer Vision: YOLO Proof of Concept Demo
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
                A proof-of-concept video demonstrating how our YOLO neural network segments, classifies, and extracts traffic metrics from intersection footage.
              </p>
            </div>
            <span className="px-4 py-1.5 rounded-full bg-sky-100 dark:bg-sky-900/40 border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-xs font-extrabold tracking-wider uppercase shadow-sm">
              Proof of Concept Demo
            </span>
          </div>

          <div className="max-w-5xl mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🎬</span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">YOLOv11 Proof of Concept Video Recording</span>
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 aspect-video shadow-inner group">
              <video
                src="/test_video_1.mp4"
                controls
                autoPlay={isPlayingDemo}
                loop
                muted
                playsInline
                className="w-full h-full object-cover z-0"
                onError={(e) => {

                  e.currentTarget.style.display = "none";
                  const fallback = document.getElementById("video-fallback-canvas");
                  if (fallback) fallback.style.display = "flex";
                }}
              />

              <div id="video-fallback-canvas" className="absolute inset-0 hidden flex-col items-center justify-center bg-slate-900 text-center p-6 space-y-4 z-10">
                <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700 text-4xl animate-bounce">
                  🎬
                </div>
                <div className="space-y-1 max-w-md">
                  <h5 className="text-lg font-bold text-white">YOLO Proof of Concept Video</h5>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">
                    Connecting to video recording... Upload your custom `test_video_1.mp4` to the `/public` directory to view the YOLO demonstration.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center">
              Proof-of-concept video showcasing automated bounding box segmentation, centroid tracking, and velocity vectors.
            </p>
          </div>
        </div>

        <div className="space-y-8 pt-8 border-t border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div>
              <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
                <span>🏛️</span> Full Stack Technology Matrix
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
                A comprehensive breakdown of the hardware, AI models, cloud infrastructure, and simulation tools powering the project.
              </p>
            </div>
            <span className="px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold tracking-wider uppercase shadow-sm">
              Stack Specification
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/60 text-xs font-extrabold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                    <th className="py-4 px-6">Architecture Layer</th>
                    <th className="py-4 px-6">Core Technologies</th>
                    <th className="py-4 px-6">Operational Role & Responsibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-medium text-slate-700 dark:text-slate-300">
                  {ARCHITECTURE_LAYERS.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {row.layer}
                      </td>
                      <td className="py-4 px-6 font-mono text-purple-600 dark:text-purple-400 font-bold">
                        {row.tech}
                      </td>
                      <td className="py-4 px-6 leading-relaxed">
                        {row.role}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
    </div>
  );
}
