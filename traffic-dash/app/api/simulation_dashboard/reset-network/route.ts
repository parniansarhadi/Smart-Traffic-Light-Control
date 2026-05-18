import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST() {
  try {
    const workspaceRoot = path.resolve(process.cwd(), "..");
    const configDir = path.join(workspaceRoot, "input_data", "sys_config");
    const backupDir = path.join(workspaceRoot, "input_data", "sys_config_backup");
    const backupPath = path.join(backupDir, "network_layout_config.json");
    const targetPath = path.join(configDir, "network_layout_config.json");

    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ error: "Backup file not found in sys_config_backup" }, { status: 404 });
    }

    fs.copyFileSync(backupPath, targetPath);

    const restored = JSON.parse(fs.readFileSync(targetPath, "utf8"));

    return NextResponse.json({ ok: true, config: restored });
  } catch (err) {
    console.error("Failed to reset network layout:", err);
    return NextResponse.json({ error: "Failed to reset network layout" }, { status: 500 });
  }
}
