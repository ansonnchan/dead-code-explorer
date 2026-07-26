import * as path from "node:path";
import { generateSyntheticRepository } from "../src/benchmark/syntheticRepo";

const outputPath = path.resolve(
  process.argv[2] ?? "benchmarks/generated/small"
);
const fileCount = Number(process.argv[3] ?? 100);

const truth = generateSyntheticRepository(outputPath, {
  fileCount,
  avgLinesPerFile: 150,
  avgImportsPerFile: 2,
  exportDensity: 4,
  reExportChainDepth: 3,
  deadCodeRatio: 0.25,
  dynamicImportRatio: 0
});

console.log(
  `Generated ${truth.sourceFileCount} source files and ${truth.expectedFindings.length} expected findings in ${outputPath}.`
);
