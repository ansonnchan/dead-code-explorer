import * as fs from "node:fs";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { scanRepository } from "../src/analysis/scanner";
import type { ExplorerConfig } from "../src/model";
import type { RepositoryBenchmarkSample } from "../src/benchmark/repositoryMetrics";

const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
  "**/out/**",
  "**/.generated/**"
];

async function main(): Promise<void> {
  const encodedRoots = process.argv[2];
  if (!encodedRoots) {
    throw new Error("Missing encoded repository roots.");
  }
  const roots = JSON.parse(
    Buffer.from(encodedRoots, "base64url").toString("utf8")
  ) as string[];
  if (roots.length === 0) {
    throw new Error("At least one repository root is required.");
  }

  const config: ExplorerConfig = {
    entryPoints: [],
    exclude: DEFAULT_EXCLUDES,
    preserve: [],
    includeTypeOnlySymbols: true,
    minimumConfidence: "low",
    scanOnSave: false
  };

  await new Promise<void>((resolve) => setImmediate(resolve));
  const timerStartedAt = performance.now();
  const eventLoopDelay = new Promise<number>((resolve) => {
    setTimeout(() => resolve(performance.now() - timerStartedAt), 0);
  });

  let durationMs = 0;
  let filesAnalyzed = 0;
  let symbolsIndexed = 0;
  let graphEdges = 0;
  let findings = 0;
  let ignoredFindings = 0;
  let linesAnalyzed = 0;

  for (const rootPath of roots) {
    const result = scanRepository(rootPath, config);
    if (result.metrics.filesAnalyzed === 0) {
      throw new Error(
        "A selected tsconfig contains no source files. It may be a solution-style monorepo config; benchmark package roots with source-bearing tsconfig.json files instead."
      );
    }
    durationMs += result.metrics.durationMs;
    filesAnalyzed += result.metrics.filesAnalyzed;
    symbolsIndexed += result.metrics.symbolsIndexed;
    graphEdges += result.metrics.graphEdges;
    findings += result.findings.length;
    ignoredFindings += result.ignoredFindings.length;
    for (const filePath of result.index.files.keys()) {
      const absolutePath = path.join(rootPath, filePath);
      if (fs.existsSync(absolutePath)) {
        linesAnalyzed += countLines(fs.readFileSync(absolutePath, "utf8"));
      }
    }
  }

  const eventLoopBlockedMs = await eventLoopDelay;
  const sample: RepositoryBenchmarkSample = {
    durationMs,
    eventLoopBlockedMs,
    peakRssMb: process.resourceUsage().maxRSS / 1_024,
    filesAnalyzed,
    linesAnalyzed,
    symbolsIndexed,
    graphEdges,
    findings,
    ignoredFindings,
    projectCount: roots.length
  };
  process.stdout.write(`${JSON.stringify(sample)}\n`);
}

function countLines(contents: string): number {
  if (contents.length === 0) {
    return 0;
  }
  return (contents.match(/\n/g) ?? []).length + 1;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
