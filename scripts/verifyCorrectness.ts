import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { scanRepository } from "../src/analysis/scanner";
import { measureCorrectness } from "../src/benchmark/correctness";
import { generateSyntheticRepository } from "../src/benchmark/syntheticRepo";
import type { ExplorerConfig } from "../src/model";

const rootPath = fs.mkdtempSync(
  path.join(os.tmpdir(), "dead-code-explorer-correctness-")
);
const explorerConfig: ExplorerConfig = {
  entryPoints: ["src/index.ts"],
  exclude: ["**/node_modules/**", "**/dist/**"],
  preserve: [],
  includeTypeOnlySymbols: true,
  minimumConfidence: "low",
  scanOnSave: false
};

try {
  const truth = generateSyntheticRepository(rootPath, {
    fileCount: 100,
    avgLinesPerFile: 150,
    avgImportsPerFile: 2,
    exportDensity: 4,
    reExportChainDepth: 3,
    deadCodeRatio: 0.25,
    dynamicImportRatio: 0
  });
  const result = scanRepository(rootPath, explorerConfig);
  const metrics = measureCorrectness(result.findings, truth);
  const report = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    filesAnalyzed: result.metrics.filesAnalyzed,
    symbolsIndexed: result.metrics.symbolsIndexed,
    approximateLoc: truth.approximateLoc,
    durationMs: result.metrics.durationMs,
    ...metrics
  };
  const outputPath = path.resolve(
    process.argv[2] ?? "benchmarks/v1-correctness.json"
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (metrics.precision !== 1 || metrics.recall !== 1) {
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(rootPath, { recursive: true, force: true });
}
