import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateSyntheticRepository } from "../src/benchmark/syntheticRepo";
import { measureCorrectness } from "../src/benchmark/correctness";
import { scanRepository } from "../src/analysis/scanner";
import { config } from "./helpers";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const rootPath of temporaryRoots.splice(0)) {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
});

describe("synthetic correctness corpus", () => {
  it("matches V1 findings against generated ground truth", () => {
    const rootPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "dead-code-explorer-ground-truth-")
    );
    temporaryRoots.push(rootPath);
    const truth = generateSyntheticRepository(rootPath, {
      fileCount: 24,
      avgLinesPerFile: 20,
      avgImportsPerFile: 2,
      exportDensity: 4,
      reExportChainDepth: 3,
      deadCodeRatio: 0.25,
      dynamicImportRatio: 0
    });

    const result = scanRepository(
      rootPath,
      config({ minimumConfidence: "low" })
    );
    const actual = result.findings
      .filter((finding) => finding.kind === "unused-export")
      .map((finding) => ({
        kind: finding.kind,
        filePath: finding.filePath,
        name: finding.name
      }))
      .sort(
        (left, right) =>
          left.filePath.localeCompare(right.filePath) ||
          left.name.localeCompare(right.name)
      );

    expect(actual).toEqual(truth.expectedFindings);
    expect(measureCorrectness(result.findings, truth)).toMatchObject({
      precision: 1,
      recall: 1,
      falsePositives: 0,
      falseNegatives: 0
    });
  });

  it("generates parseable configurations at multiple sizes", () => {
    for (const fileCount of [10, 50, 100]) {
      const rootPath = fs.mkdtempSync(
        path.join(os.tmpdir(), "dead-code-explorer-generator-")
      );
      temporaryRoots.push(rootPath);
      const truth = generateSyntheticRepository(rootPath, {
        fileCount,
        avgLinesPerFile: 12,
        avgImportsPerFile: 1,
        exportDensity: 2,
        reExportChainDepth: 1,
        deadCodeRatio: 0.5,
        dynamicImportRatio: 0
      });

      expect(fs.existsSync(path.join(rootPath, "tsconfig.json"))).toBe(true);
      expect(truth.expectedFindings).toHaveLength(fileCount);
      expect(truth.sourceFileCount).toBe(fileCount + 2);
    }
  });
});
