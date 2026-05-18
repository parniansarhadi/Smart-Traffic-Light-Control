import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const workspaceRoot = path.resolve(process.cwd(), "..");
    const dashboardRoot = path.join(workspaceRoot, "sys_output", "dashboard_data");
    const latestPath = path.join(dashboardRoot, "latest.json");

    if (!fs.existsSync(latestPath)) {
      return NextResponse.json({
        lastSimulation: "Never",
        startTime: "N/A",
        endTime: "N/A"
      });
    }

    const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    const folderName = latest.latest_run_folder;
    const wallClockStartStr = latest.wall_clock_start;
    const wallClockEndStr = latest.wall_clock_end;

    let lastSim = "Unknown";
    let wallStartObj: Date | null = null;

    if (wallClockStartStr) {
      wallStartObj = new Date(wallClockStartStr);
    } else if (folderName && folderName.includes("_")) {
      const [datePart, timePart] = folderName.split("_");
      const year = datePart.substring(0, 4);
      const month = datePart.substring(4, 6);
      const day = datePart.substring(6, 8);
      const hour = timePart.substring(0, 2);
      const minute = timePart.substring(2, 4);
      wallStartObj = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
    }

    if (wallStartObj && !isNaN(wallStartObj.getTime())) {
      const diffMs = Date.now() - wallStartObj.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) lastSim = "Just now";
      else if (diffMins < 60) lastSim = `${diffMins}m ago`;
      else lastSim = `${Math.floor(diffMins / 60)}h ago`;
    }

    let startTime = "N/A";
    if (wallStartObj && !isNaN(wallStartObj.getTime())) {
      startTime = wallStartObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    let endTime = "N/A";
    if (wallClockEndStr) {
      const endObj = new Date(wallClockEndStr);
      if (!isNaN(endObj.getTime())) {
        endTime = endObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    }

    return NextResponse.json({
      lastSimulation: lastSim,
      startTime: startTime,
      endTime: endTime
    });
  } catch (err) {
    console.error("Failed to fetch stats:", err);
    return NextResponse.json({ lastSimulation: "Error", startTime: "N/A", endTime: "N/A" });
  }
}
