import * as path from "node:path";
import type { ExplorerConfig } from "../src/model";

export const fixturesRoot = path.resolve(__dirname, "../fixtures");

export function fixturePath(name: string): string {
  return path.join(fixturesRoot, name);
}

export function config(
  overrides: Partial<ExplorerConfig> = {}
): ExplorerConfig {
  return {
    entryPoints: ["src/index.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**"
    ],
    preserve: [],
    includeTypeOnlySymbols: true,
    minimumConfidence: "low",
    scanOnSave: true,
    ...overrides
  };
}
