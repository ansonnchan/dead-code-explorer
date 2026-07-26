import { describe, expect, it } from "vitest";
import {
  distribution,
  summarizeSamples,
  type RepositoryBenchmarkSample
} from "../src/benchmark/repositoryMetrics";

describe("repository benchmark metrics", () => {
  it("calculates nearest-rank percentiles", () => {
    expect(distribution([50, 10, 40, 20, 30])).toEqual({
      min: 10,
      p50: 30,
      p95: 50,
      max: 50,
      mean: 30
    });
  });

  it("derives throughput from each measured sample", () => {
    const sample: RepositoryBenchmarkSample = {
      durationMs: 500,
      eventLoopBlockedMs: 505,
      peakRssMb: 256,
      filesAnalyzed: 100,
      linesAnalyzed: 15_000,
      symbolsIndexed: 400,
      graphEdges: 100,
      findings: 20,
      ignoredFindings: 0,
      projectCount: 1
    };
    const summary = summarizeSamples([sample]);

    expect(summary.filesPerSecond.p50).toBe(200);
    expect(summary.klocPerSecond.p50).toBe(30);
  });
});
