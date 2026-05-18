import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export async function POST(req: NextRequest) {
  try {
    const workspaceRoot = path.resolve(process.cwd(), "..");
    const cacheFile = path.join(workspaceRoot, ".rapid_grid_cache.json");

    try {
      await fs.unlink(cacheFile);
      return NextResponse.json({ ok: true, message: "Optimizer cache cleared successfully" });
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return NextResponse.json({ ok: true, message: "No cache file found to clear" });
      }
      throw err;
    }
  } catch (err: any) {
    console.error("Clear cache error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
