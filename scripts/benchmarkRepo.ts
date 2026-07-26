import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  summarizeSamples,
  type RepositoryBenchmarkSample
} from "../src/benchmark/repositoryMetrics";

interface Arguments {
  roots: string[];
  runs: number;
  warmups: number;
  timeoutMs: number;
  label: string;
  outputPath: string;
}

interface BenchmarkReport {
  schemaVersion: number;
  generatedAt: string;
  label: string;
  analyzerCommit: string;
  analyzerDirty: boolean;
  mode: string;
  scope: string;
  caveat?: string;
  environment: {
    nodeVersion: string;
    platform: string;
    architecture: string;
    cpu: string;
    logicalCores: number;
    totalMemoryGb: number;
  };
  benchmark: {
    warmupRuns: number;
    measuredRuns: number;
    projectCount: number;
    filesAnalyzed: number;
    linesAnalyzed: number;
    symbolsIndexed: number;
    graphEdges: number;
    findings: number;
    ignoredFindings: number;
  };
  results: ReturnType<typeof summarizeSamples>;
  samples: RepositoryBenchmarkSample[];
}

const options = parseArguments(process.argv.slice(2));
const workerPath = path.join(__dirname, "benchmarkScan.js");
const encodedRoots = Buffer.from(
  JSON.stringify(options.roots),
  "utf8"
).toString("base64url");

for (let run = 0; run < options.warmups; run += 1) {
  process.stderr.write(`Warm-up ${run + 1}/${options.warmups}\n`);
  runSample(workerPath, encodedRoots, options.timeoutMs);
}

const samples: RepositoryBenchmarkSample[] = [];
for (let run = 0; run < options.runs; run += 1) {
  process.stderr.write(`Measured run ${run + 1}/${options.runs}\n`);
  samples.push(runSample(workerPath, encodedRoots, options.timeoutMs));
}

const first = samples[0];
const report: BenchmarkReport = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  label: options.label,
  analyzerCommit: currentCommit(),
  analyzerDirty: hasUncommittedChanges(),
  mode: "fresh-process-full-scan",
  scope:
    options.roots.length === 1
      ? "single-tsconfig"
      : "aggregate-project-local",
  caveat:
    options.roots.length === 1
      ? undefined
      : "Projects were scanned independently. Timing is valid for performed work, but findings do not include cross-project symbol reachability.",
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpu: os.cpus()[0]?.model ?? "unknown",
    logicalCores: os.cpus().length,
    totalMemoryGb: round(os.totalmem() / 1024 ** 3)
  },
  benchmark: {
    warmupRuns: options.warmups,
    measuredRuns: options.runs,
    projectCount: first.projectCount,
    filesAnalyzed: first.filesAnalyzed,
    linesAnalyzed: first.linesAnalyzed,
    symbolsIndexed: first.symbolsIndexed,
    graphEdges: first.graphEdges,
    findings: first.findings,
    ignoredFindings: first.ignoredFindings
  },
  results: summarizeSamples(samples),
  samples
};

fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
fs.writeFileSync(
  options.outputPath,
  `${JSON.stringify(report, null, 2)}\n`
);
const markdownPath = options.outputPath.replace(/\.json$/i, ".md");
fs.writeFileSync(markdownPath, renderMarkdown(report));
process.stdout.write(
  `Wrote sanitized benchmark reports to ${options.outputPath} and ${markdownPath}\n`
);

function parseArguments(argumentsList: string[]): Arguments {
  const roots: string[] = [];
  let runs = 30;
  let warmups = 3;
  let timeoutMs = 10 * 60_000;
  let label = "private-repository";
  let outputPath: string | undefined;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const value = argumentsList[index];
    if (value === "--runs") {
      runs = positiveInteger(argumentsList[++index], "--runs");
    } else if (value === "--warmups") {
      warmups = nonNegativeInteger(argumentsList[++index], "--warmups");
    } else if (value === "--timeout-ms") {
      timeoutMs = positiveInteger(argumentsList[++index], "--timeout-ms");
    } else if (value === "--label") {
      label = sanitizeLabel(argumentsList[++index] ?? "");
    } else if (value === "--output") {
      outputPath = path.resolve(argumentsList[++index] ?? "");
    } else if (value === "--help") {
      printHelp();
      process.exit(0);
    } else if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    } else {
      roots.push(path.resolve(value));
    }
  }

  if (roots.length === 0) {
    throw new Error(
      "Provide at least one repository or package root containing tsconfig.json."
    );
  }
  for (const rootPath of roots) {
    if (!fs.existsSync(path.join(rootPath, "tsconfig.json"))) {
      throw new Error(`No tsconfig.json found in selected root: ${rootPath}`);
    }
  }
  return {
    roots,
    runs,
    warmups,
    timeoutMs,
    label,
    outputPath:
      outputPath ??
      path.resolve("benchmarks/results", `${label}-latest.json`)
  };
}

function runSample(
  workerPath: string,
  encodedRoots: string,
  timeoutMs: number
): RepositoryBenchmarkSample {
  const child = spawnSync(process.execPath, [workerPath, encodedRoots], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024
  });
  if (child.error) {
    throw child.error;
  }
  if (child.status !== 0) {
    throw new Error(child.stderr.trim() || "Benchmark worker failed.");
  }
  return JSON.parse(child.stdout.trim()) as RepositoryBenchmarkSample;
}

function currentCommit(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8"
  });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function hasUncommittedChanges(): boolean {
  const result = spawnSync("git", ["status", "--porcelain"], {
    encoding: "utf8"
  });
  return result.status !== 0 || result.stdout.trim().length > 0;
}

function renderMarkdown(report: BenchmarkReport): string {
  const { benchmark, environment, results } = report;
  return `# Dead Code Explorer Repository Benchmark

Generated: ${report.generatedAt}

## Scope

- Label: ${report.label}
- Analyzer commit: \`${report.analyzerCommit}\`
- Analyzer worktree dirty: ${report.analyzerDirty ? "yes" : "no"}
- Mode: ${report.mode}
- Scope: ${report.scope}
- Projects: ${benchmark.projectCount}
- Files: ${benchmark.filesAnalyzed.toLocaleString()}
- LOC: ${benchmark.linesAnalyzed.toLocaleString()}
- Findings: ${benchmark.findings.toLocaleString()}
${report.caveat ? `- Caveat: ${report.caveat}\n` : ""}
No repository paths or source contents are included in this report.

## Environment

- Node: ${environment.nodeVersion}
- Platform: ${environment.platform} ${environment.architecture}
- CPU: ${environment.cpu}
- Logical cores: ${environment.logicalCores}
- Memory: ${environment.totalMemoryGb} GB
- Warm-ups: ${benchmark.warmupRuns}
- Measured runs: ${benchmark.measuredRuns}

## Results

| Metric | p50 | p95 | Mean |
| --- | ---: | ---: | ---: |
| Full scan | ${results.durationMs.p50} ms | ${results.durationMs.p95} ms | ${results.durationMs.mean} ms |
| Event-loop blocked | ${results.eventLoopBlockedMs.p50} ms | ${results.eventLoopBlockedMs.p95} ms | ${results.eventLoopBlockedMs.mean} ms |
| Peak RSS | ${results.peakRssMb.p50} MB | ${results.peakRssMb.p95} MB | ${results.peakRssMb.mean} MB |
| Throughput | ${results.filesPerSecond.p50} files/s | ${results.filesPerSecond.p95} files/s | ${results.filesPerSecond.mean} files/s |
| Throughput | ${results.klocPerSecond.p50} KLOC/s | ${results.klocPerSecond.p95} KLOC/s | ${results.klocPerSecond.mean} KLOC/s |
`;
}

function positiveInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer.`);
  }
  return parsed;
}

function nonNegativeInteger(
  value: string | undefined,
  option: string
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${option} must be a non-negative integer.`);
  }
  return parsed;
}

function sanitizeLabel(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!sanitized) {
    throw new Error("--label must contain letters or numbers.");
  }
  return sanitized;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function printHelp(): void {
  process.stdout.write(`Usage:
  npm run benchmark:repo -- <project-root> [additional-project-roots] [options]

Options:
  --runs <count>       Measured fresh-process scans (default: 30)
  --warmups <count>    Unrecorded warm-up scans (default: 3)
  --timeout-ms <ms>    Per-scan timeout (default: 600000)
  --label <name>       Sanitized report label (default: private-repository)
  --output <path>      JSON report path

Each root must contain a source-bearing tsconfig.json. Multiple roots are
scanned independently and aggregated for performance only.
`);
}
