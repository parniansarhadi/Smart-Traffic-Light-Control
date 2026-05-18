import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const SYSTEM_CONFIG_PATH = path.join(process.cwd(), "../input_data/sys_config/system_param_config.json");

export async function GET() {
  try {
    const data = await fs.readFile(SYSTEM_CONFIG_PATH, "utf-8");
    const config = JSON.parse(data);

    const baseConfigs = [
      { id: "fixed_no_preempt", name: "Fixed (No Preemption)", mode: "fixed", ev_preemption: false, use_priority: false },
      { id: "fixed_with_preempt", name: "Fixed (With Preemption)", mode: "fixed", ev_preemption: true, use_priority: false },
      { id: "adaptive_no_preempt", name: "Adaptive (No Preemption)", mode: "adaptive", ev_preemption: false, use_priority: false },
      { id: "adaptive_weighted", name: "Adaptive (Weighted Priority)", mode: "adaptive", ev_preemption: false, use_priority: true },
      { id: "adaptive_with_preempt", name: "Adaptive (With Preemption)", mode: "adaptive", ev_preemption: true, use_priority: false },
      { id: "adaptive_weighted_with_preempt", name: "Adaptive (Weighted + Preemption)", mode: "adaptive", ev_preemption: true, use_priority: true },
    ];

    const candidates = {
      priority: (config.priority_tuning_candidates || []).map((c: any) => ({ ...c, type: "priority" })),
      adaptive: (config.adaptive_tuning_candidates || []).map((c: any) => ({ ...c, type: "adaptive" })),
      preemption: (config.ev_preemption_tuning_candidates || []).map((c: any) => ({ ...c, type: "preemption" })),
      meta: (config.meta_tuning_candidates || []).map((c: any) => ({ ...c, type: "meta" })),
    };

    return NextResponse.json({
      baseConfigs,
      candidates
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to read configurations" }, { status: 500 });
  }
}
