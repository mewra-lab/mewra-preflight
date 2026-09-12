import { describe, it, expect } from "vitest";
import { buildUniversalPack } from "../../../src/core/checks/packs/universal/index.js";
import type { GitDiff } from "../../../src/shared/types.js";

const CONTEXT = { workspaceRoot: "/workspace" };

function makeDiff(patch: string, files: string[] = ["src/index.ts"]): GitDiff {
  return {
    baseBranch: "main",
    headBranch: "feat/test",
    changedFiles: files.map((f) => ({ path: f, status: "modified" as const })),
    rawPatch: patch,
  };
}

describe("universal pack — no-console-log", () => {
  it("passes when no console.log in diff", async () => {
    const checks = buildUniversalPack();
    const noConsole = checks.find((c) => c.id === "universal:no-console-log")!;
    const diff = makeDiff("+const x = 1;");
    const result = await noConsole.run(diff, CONTEXT);
    expect(result.status).toBe("pass");
  });

  it("fails when console.log added in diff", async () => {
    const checks = buildUniversalPack();
    const noConsole = checks.find((c) => c.id === "universal:no-console-log")!;
    const diff = makeDiff('+console.log("debug");');
    const result = await noConsole.run(diff, CONTEXT);
    expect(result.status).toBe("fail");
    expect(result.findings.length).toBeGreaterThan(0);
  });
});

describe("universal pack — no-debugger", () => {
  it("fails when debugger statement added", async () => {
    const checks = buildUniversalPack();
    const noDbg = checks.find((c) => c.id === "universal:no-debugger")!;
    const diff = makeDiff("+debugger;");
    const result = await noDbg.run(diff, CONTEXT);
    expect(result.status).toBe("fail");
  });

  it("passes when no debugger in diff", async () => {
    const checks = buildUniversalPack();
    const noDbg = checks.find((c) => c.id === "universal:no-debugger")!;
    const diff = makeDiff("+const x = 1;");
    const result = await noDbg.run(diff, CONTEXT);
    expect(result.status).toBe("pass");
  });
});

describe("universal pack — no-env-leak", () => {
  it("detects hardcoded token in diff", async () => {
    const checks = buildUniversalPack();
    const noLeak = checks.find((c) => c.id === "universal:no-env-leak")!;
    const diff = makeDiff('+const TOKEN = "sk-abcdef1234567890";');
    const result = await noLeak.run(diff, CONTEXT);
    expect(result.status).toBe("fail");
  });

  it("passes clean code", async () => {
    const checks = buildUniversalPack();
    const noLeak = checks.find((c) => c.id === "universal:no-env-leak")!;
    const diff = makeDiff("+export const greet = (name: string) => name;");
    const result = await noLeak.run(diff, CONTEXT);
    expect(result.status).toBe("pass");
  });
});
