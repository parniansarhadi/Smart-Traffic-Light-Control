import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export async function POST(req: NextRequest) {
  try {
    const workspaceRoot = path.resolve(process.cwd(), "..");
    const sysOutputDir = path.join(workspaceRoot, "sys_output");

    try {
      const stats = await fs.stat(sysOutputDir);
      if (stats.isDirectory()) {
        const files = await fs.readdir(sysOutputDir);
        for (const file of files) {
          const filePath = path.join(sysOutputDir, file);
          await fs.rm(filePath, { recursive: true, force: true });
        }
        return NextResponse.json({ ok: true, message: "sys_output cleaned successfully" });
      }
    } catch (err) {

      return NextResponse.json({ ok: true, message: "sys_output directory not found, nothing to clean" });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Cleanup error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
