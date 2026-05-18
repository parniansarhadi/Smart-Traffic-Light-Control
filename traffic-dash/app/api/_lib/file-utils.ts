import fs from "node:fs";

export function readFilesByExtension(directory: string, extension: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const normalized = extension.toLowerCase();
  return fs
    .readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(normalized))
    .sort();
}

export function readFilesByPattern(directory: string, pattern: RegExp): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => {
      pattern.lastIndex = 0;
      return pattern.test(name);
    })
    .sort();
}