import { describe, expect, it } from "vitest";
import {
  buildImportGraph,
  findReachableFiles
} from "../src/analysis/importGraph";
import { loadProject } from "../src/analysis/projectLoader";
import { indexSymbols } from "../src/analysis/symbolIndex";
import { findReachableSymbols } from "../src/analysis/symbolReachability";
import { config, fixturePath } from "./helpers";

describe("symbol reachability", () => {
  it("builds symbol edges and traverses only from executable roots", () => {
    const explorerConfig = config();
    const { context } = loadProject(
      fixturePath("symbol-reachability"),
      explorerConfig
    );
    const index = buildImportGraph(context, explorerConfig.entryPoints);
    indexSymbols(index, context, explorerConfig);
    const reachableFiles = findReachableFiles(
      index.files,
      explorerConfig.entryPoints
    );
    const reachableSymbols = findReachableSymbols(
      index,
      reachableFiles,
      explorerConfig
    );
    const names = [...reachableSymbols].map(
      (symbolId) => index.symbols.get(symbolId)?.name
    );

    expect(names).toContain("runApplication");
    expect(names).toContain("liveHelper");
    expect(names).not.toContain("deadHelper");
    expect(names).not.toContain("cycleA");
    expect(names).not.toContain("cycleB");
  });
});
