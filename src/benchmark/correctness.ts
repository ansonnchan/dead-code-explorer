import type { Finding } from "../model";
import type {
  ExpectedSyntheticFinding,
  SyntheticGroundTruth
} from "./syntheticRepo";

export interface CorrectnessMetrics {
  expected: number;
  actual: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
}

export function measureCorrectness(
  findings: Finding[],
  truth: SyntheticGroundTruth
): CorrectnessMetrics {
  const expected = new Set(truth.expectedFindings.map(expectedKey));
  const actual = new Set(
    findings
      .filter((finding) => finding.kind === "unused-export")
      .map(
        (finding) =>
          `${finding.kind}:${finding.filePath}:${finding.name}`
      )
  );
  const truePositives = [...actual].filter((key) => expected.has(key)).length;
  const falsePositives = actual.size - truePositives;
  const falseNegatives = expected.size - truePositives;
  return {
    expected: expected.size,
    actual: actual.size,
    truePositives,
    falsePositives,
    falseNegatives,
    precision: actual.size === 0 ? 1 : truePositives / actual.size,
    recall: expected.size === 0 ? 1 : truePositives / expected.size
  };
}

function expectedKey(finding: ExpectedSyntheticFinding): string {
  return `${finding.kind}:${finding.filePath}:${finding.name}`;
}
