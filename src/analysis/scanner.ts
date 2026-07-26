import { performance } from "node:perf_hooks";
import type { ExplorerConfig, ScanResult } from "../model";
import { meetsMinimumConfidence } from "./confidence";
import {
  buildImportGraph,
  findReachableFiles,
  resolveEntryPoints
} from "./importGraph";
import { createFindings } from "./findings";
import { loadProject } from "./projectLoader";
import { indexSymbols } from "./symbolIndex";

export function scanRepository(
  rootPath: string,
  config: ExplorerConfig,
  ignoredIds: Set<string> = new Set()
): ScanResult {
  const startedAt = performance.now();
  const { context } = loadProject(rootPath, config);
  const entryPointResolution = resolveEntryPoints(context, config);
  const index = buildImportGraph(context, entryPointResolution.entryPoints);
  indexSymbols(index, context, config);
  const reachable = findReachableFiles(
    index.files,
    entryPointResolution.entryPoints
  );
  const generated = createFindings(index, reachable, config, ignoredIds);
  const graphEdges = [...index.files.values()].reduce(
    (total, file) => total + file.imports.size,
    0
  );

  return {
    index,
    findings: generated.findings.filter((finding) =>
      meetsMinimumConfidence(finding.confidence, config.minimumConfidence)
    ),
    ignoredFindings: generated.ignoredFindings,
    entryPoints: entryPointResolution.entryPoints,
    inferredEntryPoints: entryPointResolution.inferred,
    warnings: entryPointResolution.warnings,
    metrics: {
      filesAnalyzed: index.files.size,
      symbolsIndexed: index.symbols.size,
      graphEdges,
      durationMs: Math.round(performance.now() - startedAt)
    }
  };
}
