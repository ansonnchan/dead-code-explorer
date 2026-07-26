import * as path from "node:path";
import * as vscode from "vscode";
import type { ExplorerConfig } from "./model";

export const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
  "**/out/**",
  "**/.generated/**"
];

export function readConfig(): ExplorerConfig {
  const config = vscode.workspace.getConfiguration("deadCodeExplorer");
  return {
    entryPoints: config.get<string[]>("entryPoints", []).map(normalizeConfigPath),
    exclude: [
      ...DEFAULT_EXCLUDES,
      ...config.get<string[]>("exclude", [])
    ],
    preserve: config.get<string[]>("preserve", []).map(normalizeConfigPath),
    includeTypeOnlySymbols: config.get<boolean>("includeTypeOnlySymbols", true),
    minimumConfidence: config.get<ExplorerConfig["minimumConfidence"]>(
      "minimumConfidence",
      "medium"
    ),
    scanOnSave: config.get<boolean>("scanOnSave", true)
  };
}

export function normalizeConfigPath(value: string): string {
  return value.replaceAll(path.sep, "/").replace(/^\.\//, "");
}
