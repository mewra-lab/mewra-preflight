import { describe, it, expect, vi } from "vitest";
import { configureChecks } from "../../src/core/config/check-settings.js";
import { buildJsTsPack } from "../../src/core/checks/packs/js-ts/index.js";
import { buildPythonPack } from "../../src/core/checks/packs/python/index.js";
import { runChecks } from "../../src/core/checks/runner.js";
import type { GitDiff } from "../../src/shared/types.js";

const diff: GitDiff = {
  baseBranch: "main",
  headBranch: "feature",
  rawPatch: "",
  changedFiles: [{ path: "src/app.py", status: "modified" }],
};

describe("per-check configuration", () => {
  it("disables individual checks without disabling the entire pack", () => {
    const checks = configureChecks(buildJsTsPack(), {
      ecosystems: {
        "js-ts": { lint: { enabled: false }, testPairing: { enabled: false } },
      },
    });
    expect(checks.map((check) => check.id)).toEqual([
      "js-ts:prettier",
      "js-ts:tsc",
    ]);
  });
  it("honors explicit supported tool selection and timeout", async () => {
    const resolveTool = vi.fn(async (name: string) => `/tool/${name}`);
    const runCommand = vi.fn(async () => ({ code: 0, stdout: "", stderr: "" }));
    const checks = configureChecks(buildPythonPack(), {
      ecosystems: { python: { format: { tool: "black", timeoutMs: 1234 } } },
    });
    await runChecks(
      checks.filter((check) => check.id === "python:format"),
      diff,
      { workspaceRoot: "/mock", resolveTool, runCommand },
    );
    expect(resolveTool).toHaveBeenCalledWith("black");
    expect(resolveTool).not.toHaveBeenCalledWith("ruff");
    expect(runCommand).toHaveBeenCalledWith(
      "/tool/black",
      ["--check", "src/app.py"],
      undefined,
      1234,
    );
  });
  it("rejects arbitrary tool substitutions", () => {
    expect(() =>
      configureChecks(buildJsTsPack(), {
        ecosystems: { "js-ts": { lint: { tool: "sh" } } },
      }),
    ).toThrow("Unsupported tool");
  });
  it("uses explicitly selected vue-tsc even for a TypeScript-only diff", async () => {
    const resolveTool = vi.fn(async (name: string) => `/tool/${name}`);
    const runCommand = vi.fn(async () => ({ code: 0, stdout: "", stderr: "" }));
    const checks = configureChecks(buildJsTsPack(), {
      ecosystems: { "js-ts": { typecheck: { tool: "vue-tsc" } } },
    });
    await runChecks(
      checks.filter((check) => check.id === "js-ts:tsc"),
      { ...diff, changedFiles: [{ path: "src/app.ts", status: "modified" }] },
      { workspaceRoot: "/mock", resolveTool, runCommand },
    );
    expect(resolveTool).toHaveBeenCalledWith("vue-tsc");
    expect(runCommand).toHaveBeenCalledWith("/tool/vue-tsc", [
      "--noEmit",
      "--pretty",
      "false",
    ]);
  });
  it("honors test-pairing source patterns", () => {
    const checks = configureChecks(buildJsTsPack(), {
      ecosystems: { "js-ts": { testPairing: { pattern: "src/services/**" } } },
    });
    const pairing = checks.find((check) => check.id === "js-ts:test-pairing")!;
    expect(
      pairing.appliesTo({
        ...diff,
        changedFiles: [{ path: "src/utils/calc.ts", status: "added" }],
      }),
    ).toBe(false);
    expect(
      pairing.appliesTo({
        ...diff,
        changedFiles: [{ path: "src/services/calc.ts", status: "added" }],
      }),
    ).toBe(true);
  });
});
