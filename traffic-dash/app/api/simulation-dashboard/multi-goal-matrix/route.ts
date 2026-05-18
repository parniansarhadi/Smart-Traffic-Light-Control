import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const workspaceRoot = path.resolve(process.cwd(), "..");
    const matrixPath = path.join(workspaceRoot, "sys_output", "dashboard_data", "multi_goal_matrix_results.json");

    if (!fs.existsSync(matrixPath)) {
      return NextResponse.json({
        error: "Matrix results not found. Run the benchmark matrix first.",
        goals: {}
      }, { status: 200 });
    }

    const data = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to fetch multi-goal matrix results:", err);
    return NextResponse.json({ error: "Failed to read matrix results file", goals: {} }, { status: 500 });
  }
}
