import { describe, it, expect } from "vitest";
import { buildUniversalPack } from "../../../src/core/checks/packs/universal/index.js";
import type { GitDiff } from "../../../src/shared/types.js";

const CONTEXT = {
  workspaceRoot: "/workspace",
  resolveTool: async () => null,
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
};

function makeDiff(
  patch: string,
  files: Array<{ path: string; status?: "added" | "modified" | "deleted" }> = [
    { path: "src/index.ts", status: "modified" },
  ],
): GitDiff {
  return {
    baseBranch: "main",
    headBranch: "feat/test",
    changedFiles: files.map((f) => ({
      path: f.path,
      status: f.status ?? "modified",
    })),
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

describe("universal pack — vue file appliesTo", () => {
  it("applies no-console-log and no-debugger to .vue files", () => {
    const checks = buildUniversalPack();
    const noConsole = checks.find((c) => c.id === "universal:no-console-log")!;
    const noDbg = checks.find((c) => c.id === "universal:no-debugger")!;

    const vueDiff = makeDiff("", [
      { path: "src/views/Home.vue", status: "modified" },
    ]);
    expect(noConsole.appliesTo(vueDiff)).toBe(true);
    expect(noDbg.appliesTo(vueDiff)).toBe(true);
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

describe("universal pack — no-localhost-urls", () => {
  it("fails when localhost URL added in diff", async () => {
    const checks = buildUniversalPack();
    const noLocalhost = checks.find(
      (c) => c.id === "universal:no-localhost-urls",
    )!;
    const diff = makeDiff('+const URL = "http://localhost:3000/api";');
    const result = await noLocalhost.run(diff, CONTEXT);
    expect(result.status).toBe("fail");
    expect(result.findings.length).toBe(1);
  });

  it("passes when non-localhost URL used", async () => {
    const checks = buildUniversalPack();
    const noLocalhost = checks.find(
      (c) => c.id === "universal:no-localhost-urls",
    )!;
    const diff = makeDiff('+const URL = "https://api.mewra.app";');
    const result = await noLocalhost.run(diff, CONTEXT);
    expect(result.status).toBe("pass");
  });
});

describe("universal pack — no-merge-conflict-markers", () => {
  it("fails when conflict markers exist in added diff lines", async () => {
    const checks = buildUniversalPack();
    const noConflict = checks.find(
      (c) => c.id === "universal:no-merge-conflicts",
    )!;
    const diff = makeDiff(
      "+<<<<<<< HEAD\n+const a = 1;\n+=======\n+const a = 2;\n+>>>>>>> branch",
    );
    const result = await noConflict.run(diff, CONTEXT);
    expect(result.status).toBe("fail");
    expect(result.findings.length).toBe(3);
  });

  it("passes when no conflict markers present", async () => {
    const checks = buildUniversalPack();
    const noConflict = checks.find(
      (c) => c.id === "universal:no-merge-conflicts",
    )!;
    const diff = makeDiff("+const a = 1;");
    const result = await noConflict.run(diff, CONTEXT);
    expect(result.status).toBe("pass");
  });
});

describe("universal pack — large-file-warning", () => {
  it("applies to newly added files", () => {
    const checks = buildUniversalPack();
    const largeFile = checks.find(
      (c) => c.id === "universal:large-file-warning",
    )!;
    const diffAdded = makeDiff("", [{ path: "bundle.bin", status: "added" }]);
    const diffModified = makeDiff("", [
      { path: "bundle.bin", status: "modified" },
    ]);
    expect(largeFile.appliesTo(diffAdded)).toBe(true);
    expect(largeFile.appliesTo(diffModified)).toBe(false);
  });
});
