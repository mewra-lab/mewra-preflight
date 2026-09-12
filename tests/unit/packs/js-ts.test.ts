import { describe, it, expect } from "vitest";
import { buildJsTsPack } from "../../../src/core/checks/packs/js-ts/index.js";
import type { GitDiff } from "../../../src/shared/types.js";
import type { PreFlightContext } from "../../../src/core/checks/check-contract.js";

function makeDiff(
  files: Array<{ path: string; status?: "added" | "modified" | "deleted" }>,
): GitDiff {
  return {
    baseBranch: "main",
    headBranch: "feat/test",
    changedFiles: files.map((f) => ({
      path: f.path,
      status: f.status ?? "modified",
    })),
    rawPatch: "",
  };
}

const mockContext = (
  overrides?: Partial<PreFlightContext>,
): PreFlightContext => ({
  workspaceRoot: "/mock",
  resolveTool: async () => null,
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
  ...overrides,
});

describe("buildJsTsPack", () => {
  it("returns prettier, eslint, tsc, and test-pairing checks", () => {
    const checks = buildJsTsPack();
    const ids = checks.map((c) => c.id);
    expect(ids).toContain("js-ts:prettier");
    expect(ids).toContain("js-ts:eslint");
    expect(ids).toContain("js-ts:tsc");
    expect(ids).toContain("js-ts:test-pairing");
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

describe("js-ts pack — graceful degradation", () => {
  it("marks prettier not-configured when tool not found", async () => {
    const checks = buildJsTsPack();
    const prettier = checks.find((c) => c.id === "js-ts:prettier")!;
    const diff = makeDiff([{ path: "src/app.ts" }]);
    const result = await prettier.run(
      diff,
      mockContext({ resolveTool: async () => null }),
    );
    expect(result.status).toBe("not-configured");
  });

  it("marks eslint not-configured when tool not found", async () => {
    const checks = buildJsTsPack();
    const eslint = checks.find((c) => c.id === "js-ts:eslint")!;
    const diff = makeDiff([{ path: "src/app.ts" }]);
    const result = await eslint.run(
      diff,
      mockContext({ resolveTool: async () => null }),
    );
    expect(result.status).toBe("not-configured");
  });

  it("marks tsc not-configured when tool not found", async () => {
    const checks = buildJsTsPack();
    const tsc = checks.find((c) => c.id === "js-ts:tsc")!;
    const diff = makeDiff([{ path: "src/app.ts" }]);
    const result = await tsc.run(
      diff,
      mockContext({ resolveTool: async () => null }),
    );
    expect(result.status).toBe("not-configured");
  });
});

describe("js-ts pack — test-pairing", () => {
  it("flags missing test for newly added src source file", async () => {
    const checks = buildJsTsPack();
    const pairing = checks.find((c) => c.id === "js-ts:test-pairing")!;
    const diff = makeDiff([{ path: "src/utils/calc.ts", status: "added" }]);
    const result = await pairing.run(diff, mockContext());
    expect(result.status).toBe("warning");
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]?.file).toBe("src/utils/calc.ts");
  });

  it("passes when matching test file is also in diff", async () => {
    const checks = buildJsTsPack();
    const pairing = checks.find((c) => c.id === "js-ts:test-pairing")!;
    const diff = makeDiff([
      { path: "src/utils/calc.ts", status: "added" },
      { path: "tests/unit/calc.test.ts", status: "added" },
    ]);
    const result = await pairing.run(diff, mockContext());
    expect(result.status).toBe("pass");
  });
});
