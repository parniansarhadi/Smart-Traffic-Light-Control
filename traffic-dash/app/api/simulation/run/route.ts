import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";

let currentProcess: any = null;
let currentStatus = {
  isRunning: false,
  progress: 0,
  logs: [] as string[],
  lastUpdated: Date.now()
};

export async function GET() {
  return NextResponse.json(currentStatus);
}

export async function POST(req: NextRequest) {
  if (currentStatus.isRunning) {
    return NextResponse.json({ error: "Simulation already running" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { customCommand } = body;

    const workspaceRoot = path.resolve(process.cwd(), "..");

    let child;
    if (customCommand) {
      currentStatus = {
        isRunning: true,
        progress: 0,
        logs: [`Starting custom simulation at ${new Date().toLocaleTimeString()}`, `Command: ${customCommand}`],
        lastUpdated: Date.now()
      };

      child = spawn(customCommand, {
        shell: true,
        cwd: workspaceRoot,
        env: { ...process.env, PYTHONPATH: workspaceRoot },
        detached: true 
      });
    } else {
      const { mode = "real", trafficSource = "stream", simTime = 720 } = body;
      const pythonPath = "python3";
      const scriptPath = path.join(workspaceRoot, "sim_unit/core/main.py");

      const args = [
        scriptPath,
        "--mode", mode,
        "--real-traffic-source", trafficSource,
        "--real-total-sim", simTime.toString()
      ];

      currentStatus = {
        isRunning: true,
        progress: 0,
        logs: [`Starting simulation at ${new Date().toLocaleTimeString()}`],
        lastUpdated: Date.now()
      };

      child = spawn(pythonPath, args, {
        cwd: workspaceRoot,
        env: { ...process.env, PYTHONPATH: workspaceRoot },
        detached: true 
      });
    }

    currentProcess = child;

    child.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      lines.forEach((line: string) => {
        if (line.trim()) {
          currentStatus.logs.push(line.trim());

          if (line.includes(">>> RUNNING:")) {
            currentStatus.progress = Math.min(90, currentStatus.progress + 15);
          }

          const progressMatch = line.match(/\[progress\].*\((\s*[\d.]+)%\)/);
          if (progressMatch) {
            currentStatus.progress = parseFloat(progressMatch[1].trim());
          }
        }
      });
      if (currentStatus.logs.length > 200) currentStatus.logs = currentStatus.logs.slice(-200);
      currentStatus.lastUpdated = Date.now();
    });

    child.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) {
        currentStatus.logs.push(`STDERR: ${msg}`);
        currentStatus.lastUpdated = Date.now();
      }
    });

    child.on("error", (err) => {
      currentStatus.isRunning = false;
      currentStatus.logs.push(`PROCESS ERROR: ${err.message}`);
      currentStatus.lastUpdated = Date.now();
      currentProcess = null;
    });

    child.on("close", (code) => {
      currentStatus.isRunning = false;
      currentStatus.progress = 100;
      currentStatus.logs.push(`Simulation process exited with code ${code}`);
      currentStatus.lastUpdated = Date.now();
      currentProcess = null;
    });

    child.unref();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Simulation run error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE() {
  if (currentProcess && currentProcess.pid) {
    try {

      process.kill(-currentProcess.pid, 'SIGINT');
    } catch (err) {
      console.warn("Failed to kill via PGID, falling back to direct kill:", err);
      try { currentProcess.kill('SIGINT'); } catch (e) {}
    }

    currentStatus.isRunning = false;
    currentStatus.logs.push("Simulation termination requested by user");
    currentProcess = null;
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "No simulation running" }, { status: 400 });
}
