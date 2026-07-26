import { describe, expect, it } from "vitest";
import { scanRepository } from "../src/analysis/scanner";
import { config, fixturePath } from "./helpers";

describe("repository scanner", () => {
  it("finds an unreachable file and a genuinely unused export", () => {
    const result = scanRepository(
      fixturePath("simple-project"),
      config()
    );

    expect(
      result.findings.some(
        (finding) =>
          finding.kind === "unreachable-file" &&
          finding.filePath === "src/orphan.ts"
      )
    ).toBe(true);
    expect(
      result.findings.some(
        (finding) =>
          finding.kind === "unused-export" &&
          finding.name === "unusedGreeting"
      )
    ).toBe(true);
    expect(
      result.findings.some((finding) => finding.name === "greet")
    ).toBe(false);
  });

  it("traces an export through a barrel to its consumer", () => {
    const result = scanRepository(
      fixturePath("barrel-exports"),
      config({ entryPoints: ["src/main.ts"] })
    );

    expect(
      result.findings.some(
        (finding) => finding.name === "barrelOnlyConsumer"
      )
    ).toBe(false);
    expect(
      result.findings.some(
        (finding) =>
          finding.kind === "unused-export" && finding.name === "staleExport"
      )
    ).toBe(true);
  });

  it("lowers confidence when non-static dynamic imports exist", () => {
    const result = scanRepository(
      fixturePath("dynamic-imports"),
      config()
    );
    const plugin = result.findings.find(
      (finding) => finding.name === "conventionLoadedPlugin"
    );

    expect(plugin?.risks).toContain("dynamic-import");
    expect(plugin?.confidence).not.toBe("high");
  });

  it("treats package entry exports as a public API risk", () => {
    const result = scanRepository(
      fixturePath("public-library"),
      config()
    );
    const publicExport = result.findings.find(
      (finding) => finding.name === "externalConsumerOnly"
    );

    expect(publicExport?.risks).toContain("public-api");
    expect(publicExport?.confidence).toBe("low");
  });

  it("moves persisted ignores into the ignored group", () => {
    const first = scanRepository(fixturePath("simple-project"), config());
    const target = first.findings.find(
      (finding) => finding.name === "unusedGreeting"
    );
    expect(target).toBeDefined();

    const second = scanRepository(
      fixturePath("simple-project"),
      config(),
      new Set([target!.id])
    );

    expect(second.findings.some((finding) => finding.id === target!.id)).toBe(
      false
    );
    expect(
      second.ignoredFindings.some((finding) => finding.id === target!.id)
    ).toBe(true);
  });

  it("honors inline suppressions and preserve globs", () => {
    const inlineResult = scanRepository(
      fixturePath("simple-project"),
      config()
    );
    expect(
      inlineResult.ignoredFindings.some(
        (finding) => finding.name === "metadataDiscoveredGreeting"
      )
    ).toBe(true);

    const preservedResult = scanRepository(
      fixturePath("simple-project"),
      config({ preserve: ["src/orphan.ts"] })
    );
    expect(
      preservedResult.ignoredFindings.some(
        (finding) =>
          finding.kind === "unreachable-file" &&
          finding.filePath === "src/orphan.ts"
      )
    ).toBe(true);
  });

  it("analyzes JavaScript exports with JSDoc type checking enabled", () => {
    const result = scanRepository(
      fixturePath("javascript-jsdoc"),
      config({ entryPoints: ["src/index.js"] })
    );

    expect(
      result.findings.some(
        (finding) =>
          finding.kind === "unused-export" &&
          finding.name === "unusedLegacyHelper"
      )
    ).toBe(true);
    expect(
      result.findings.some((finding) => finding.name === "formatUser")
    ).toBe(false);
  });

  it("maps Vue script-block findings back to the original SFC", () => {
    const result = scanRepository(
      fixturePath("vue-sfc"),
      config({ entryPoints: ["src/App.vue"] })
    );
    const finding = result.findings.find(
      (item) => item.name === "unusedVueHelper"
    );

    expect(finding).toMatchObject({
      kind: "unused-local",
      filePath: "src/App.vue",
      startLine: 10
    });
    expect(
      result.findings.some((item) => item.name === "liveHelper")
    ).toBe(false);
  });

  it("finds functions referenced only from unreachable symbol chains", () => {
    const result = scanRepository(
      fixturePath("symbol-reachability"),
      config()
    );

    expect(
      result.findings
        .filter((finding) => finding.kind === "unreachable-symbol")
        .map((finding) => finding.name)
        .sort()
    ).toEqual(["cycleA", "cycleB", "deadHelper"]);
    expect(
      result.findings.some(
        (finding) =>
          finding.kind === "unused-export" &&
          finding.name === "abandonedFeature"
      )
    ).toBe(true);
    expect(
      result.findings.some((finding) =>
        ["runApplication", "liveHelper"].includes(finding.name)
      )
    ).toBe(false);
  });
});
