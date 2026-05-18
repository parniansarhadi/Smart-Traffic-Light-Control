import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { resolveWorkspaceRoot } from "../_lib/workspace-root";

export const dynamic = "force-dynamic";

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp"]);

function contentTypeByExt(ext: string): string {
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function GET(req: NextRequest) {
  try {
    const file = req.nextUrl.searchParams.get("file");
    if (!file) {
      return NextResponse.json({ status: "error", message: "Missing file query param" }, { status: 400 });
    }

    const normalized = path.normalize(file).replace(/^([/\\])+/, "");
    if (normalized.includes("..")) {
      return NextResponse.json({ status: "error", message: "Invalid path" }, { status: 400 });
    }

    const ext = path.extname(normalized).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ status: "error", message: "Unsupported file type" }, { status: 400 });
    }

    const resultsRoot = path.join(resolveWorkspaceRoot(), "sys_output");
    const absoluteResultsRoot = path.resolve(resultsRoot);
    const abs = path.resolve(resultsRoot, normalized);

    if (!abs.startsWith(absoluteResultsRoot)) {
      return NextResponse.json({ status: "error", message: "Invalid path scope" }, { status: 400 });
    }

    if (!fs.existsSync(abs)) {
      return NextResponse.json(
        {
          status: "error",
          message: "File not found",
          debug: `Requested file: ${abs} | Results root: ${absoluteResultsRoot}`,
        },
        { status: 404 }
      );
    }

    const buffer = fs.readFileSync(abs);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypeByExt(ext),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown image API error",
      },
      { status: 500 }
    );
  }
}
