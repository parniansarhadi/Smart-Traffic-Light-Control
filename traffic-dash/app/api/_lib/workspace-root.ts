import fs from "node:fs";
import path from "node:path";

function hasExpectedLayout(rootDir: string): boolean {
  const hasConfigFile = fs.existsSync(path.join(rootDir, "input_data", "sys_config", "system_param_config.json"));
  return hasConfigFile;
}

export function resolveWorkspaceRoot(startDir: string = process.cwd()): string {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (hasExpectedLayout(currentDir)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  throw new Error(
    `Could not resolve workspace root from ${startDir}. Expected a directory containing input_data/sys_config/system_param_config.json.`
  );
}