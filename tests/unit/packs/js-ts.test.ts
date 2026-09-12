import { describe, it, expect } from "vitest";
import { buildJsTsPack } from "../../../src/core/checks/packs/js-ts/index.js";

describe("buildJsTsPack", () => {
  it("returns prettier, eslint, and tsc checks", () => {
    const checks = buildJsTsPack();
    const ids = checks.map((c) => c.id);
    expect(ids).toContain("js-ts:prettier");
    expect(ids).toContain("js-ts:eslint");
    expect(ids).toContain("js-ts:tsc");
  });

  it("each check has required properties", () => {
    for (const check of buildJsTsPack()) {
      expect(typeof check.id).toBe("string");
      expect(typeof check.label).toBe("string");
      expect(["error", "warning"]).toContain(check.severity);
      expect(check.pack).toBe("js-ts");
    }
  });
});
