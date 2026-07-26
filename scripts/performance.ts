import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { scanRepository } from "../src/analysis/scanner";
import type { ExplorerConfig } from "../src/model";

const requestedSizes = process.argv
  .slice(2)
  .map(Number)
  .filter((value) => Number.isInteger(value) && value > 0);
const sizes = requestedSizes.length > 0 ? requestedSizes : [100, 1000, 5000];
const config: ExplorerConfig = {
  entryPoints: ["src/index.ts"],
  exclude: ["**/node_modules/**", "**/dist/**"],
  preserve: [],
  includeTypeOnlySymbols: true,
  minimumConfidence: "low",
  scanOnSave: false
};

console.log("files\tduration_ms\theap_delta_mb\tsymbols\tedges");
for (const size of sizes) {
  const rootPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "dead-code-explorer-perf-")
  );
  try {
    createSyntheticRepository(rootPath, size);
    const heapBefore = process.memoryUsage().heapUsed;
    const result = scanRepository(rootPath, config);
    const heapDelta =
      (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);
    console.log(
      [
        result.metrics.filesAnalyzed,
        result.metrics.durationMs,
        heapDelta.toFixed(1),
        result.metrics.symbolsIndexed,
        result.metrics.graphEdges
      ].join("\t")
    );
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}

function createSyntheticRepository(rootPath: string, size: number): void {
  const sourcePath = path.join(rootPath, "src");
  fs.mkdirSync(sourcePath, { recursive: true });
  fs.writeFileSync(
    path.join(rootPath, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "CommonJS",
        moduleResolution: "Node",
        strict: true
      },
      include: ["src/**/*.ts"]
    })
  );
  fs.writeFileSync(
    path.join(sourcePath, "index.ts"),
    [
      ...Array.from(
        { length: size },
        (_, index) =>
          `import { value${index} } from "./file-${index}";`
      ),
      ...Array.from(
        { length: size },
        (_, index) => `void value${index}();`
      ),
      ""
    ].join("\n")
  );
  for (let index = 0; index < size; index += 1) {
    fs.writeFileSync(
      path.join(sourcePath, `file-${index}.ts`),
      `export function value${index}(): number { return ${index}; }\n`
    );
  }
}
