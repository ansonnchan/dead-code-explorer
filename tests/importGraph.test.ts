import { describe, expect, it } from "vitest";
import {
  buildImportGraph,
  findReachableFiles,
  resolveEntryPoints
} from "../src/analysis/importGraph";
import { loadProject } from "../src/analysis/projectLoader";
import { config, fixturePath } from "./helpers";

describe("import graph", () => {
  it("builds relative import edges and traverses reachable files", () => {
    const explorerConfig = config();
    const { context } = loadProject(
      fixturePath("simple-project"),
      explorerConfig
    );
    const entries = resolveEntryPoints(context, explorerConfig);
    const index = buildImportGraph(context, entries.entryPoints);
    const reachable = findReachableFiles(index.files, entries.entryPoints);

    expect(index.files.get("src/index.ts")?.imports).toEqual(
      new Set(["src/greet.ts"])
    );
    expect(reachable).toEqual(new Set(["src/index.ts", "src/greet.ts"]));
    expect(reachable.has("src/orphan.ts")).toBe(false);
  });

  it("uses TypeScript resolution for path aliases", () => {
    const explorerConfig = config();
    const { context } = loadProject(
      fixturePath("path-aliases"),
      explorerConfig
    );
    const index = buildImportGraph(context, explorerConfig.entryPoints);

    expect(index.files.get("src/index.ts")?.imports).toEqual(
      new Set(["src/lib/format.ts"])
    );
  });

  it("includes re-export edges in barrel chains", () => {
    const explorerConfig = config({ entryPoints: ["src/main.ts"] });
    const { context } = loadProject(
      fixturePath("barrel-exports"),
      explorerConfig
    );
    const index = buildImportGraph(context, explorerConfig.entryPoints);

    expect(index.files.get("src/main.ts")?.imports).toEqual(
      new Set(["src/index.ts"])
    );
    expect(index.files.get("src/index.ts")?.imports).toEqual(
      new Set(["src/feature.ts"])
    );
  });

  it("resolves dynamic imports with static module specifiers", () => {
    const explorerConfig = config();
    const { context } = loadProject(
      fixturePath("dynamic-imports"),
      explorerConfig
    );
    const index = buildImportGraph(context, explorerConfig.entryPoints);

    expect(index.files.get("src/index.ts")?.imports).toContain(
      "src/static-plugin.ts"
    );
    expect(index.files.get("src/index.ts")?.containsDynamicImport).toBe(true);
  });
});
