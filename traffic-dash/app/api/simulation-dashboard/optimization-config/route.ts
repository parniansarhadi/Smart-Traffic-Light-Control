import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const OPT_CONFIG_PATH = path.join(process.cwd(), "../input_data/sys_config/optimization_config.json");

export async function GET() {
  try {
    const data = await fs.readFile(OPT_CONFIG_PATH, "utf-8");
    return new Response(data, { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Failed to read optimization config" }), { status: 500 });
  }
}
