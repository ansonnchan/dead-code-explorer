import { describe, expect, it } from "vitest";
import { matchesAny, toPosixPath } from "../src/analysis/paths";

describe("path helpers", () => {
  it("normalizes platform separators", () => {
    expect(toPosixPath("src\\feature\\index.ts")).toBe(
      "src/feature/index.ts"
    );
  });

  it("matches workspace-relative ignore globs", () => {
    expect(matchesAny("src/generated/foo.ts", ["**/generated/**"])).toBe(
      true
    );
    expect(matchesAny("src/live/foo.ts", ["**/generated/**"])).toBe(false);
  });
});
