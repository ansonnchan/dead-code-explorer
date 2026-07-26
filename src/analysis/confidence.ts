import type { Confidence } from "../model";

export function scoreToConfidence(score: number): Confidence {
  if (score >= 5) {
    return "high";
  }
  if (score >= 2) {
    return "medium";
  }
  return "low";
}

export function meetsMinimumConfidence(
  confidence: Confidence,
  minimum: Confidence
): boolean {
  const rank: Record<Confidence, number> = {
    low: 0,
    medium: 1,
    high: 2
  };
  return rank[confidence] >= rank[minimum];
}
