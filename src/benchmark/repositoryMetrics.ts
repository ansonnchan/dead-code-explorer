export interface RepositoryBenchmarkSample {
  durationMs: number;
  eventLoopBlockedMs: number;
  peakRssMb: number;
  filesAnalyzed: number;
  linesAnalyzed: number;
  symbolsIndexed: number;
  graphEdges: number;
  findings: number;
  ignoredFindings: number;
  projectCount: number;
}

export interface Distribution {
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

export interface RepositoryBenchmarkSummary {
  durationMs: Distribution;
  eventLoopBlockedMs: Distribution;
  peakRssMb: Distribution;
  filesPerSecond: Distribution;
  klocPerSecond: Distribution;
}

export function summarizeSamples(
  samples: RepositoryBenchmarkSample[]
): RepositoryBenchmarkSummary {
  if (samples.length === 0) {
    throw new Error("At least one benchmark sample is required.");
  }
  return {
    durationMs: distribution(samples.map((sample) => sample.durationMs)),
    eventLoopBlockedMs: distribution(
      samples.map((sample) => sample.eventLoopBlockedMs)
    ),
    peakRssMb: distribution(samples.map((sample) => sample.peakRssMb)),
    filesPerSecond: distribution(
      samples.map(
        (sample) => sample.filesAnalyzed / (sample.durationMs / 1_000)
      )
    ),
    klocPerSecond: distribution(
      samples.map(
        (sample) =>
          sample.linesAnalyzed / 1_000 / (sample.durationMs / 1_000)
      )
    )
  };
}

export function distribution(values: number[]): Distribution {
  if (values.length === 0) {
    throw new Error("Cannot calculate a distribution without values.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: round(sorted[0]),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1)!),
    mean: round(
      sorted.reduce((total, value) => total + value, 0) / sorted.length
    )
  };
}

function percentile(sortedValues: number[], percentileValue: number): number {
  const index = Math.max(
    0,
    Math.ceil(percentileValue * sortedValues.length) - 1
  );
  return sortedValues[index];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
