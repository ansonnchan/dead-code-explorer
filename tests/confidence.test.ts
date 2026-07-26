import { describe, expect, it } from "vitest";
import {
  meetsMinimumConfidence,
  scoreToConfidence
} from "../src/analysis/confidence";

describe("confidence scoring", () => {
  it("maps the documented score buckets", () => {
    expect(scoreToConfidence(5)).toBe("high");
    expect(scoreToConfidence(2)).toBe("medium");
    expect(scoreToConfidence(1)).toBe("low");
  });

  it("filters by minimum confidence", () => {
    expect(meetsMinimumConfidence("high", "medium")).toBe(true);
    expect(meetsMinimumConfidence("low", "medium")).toBe(false);
  });
});
