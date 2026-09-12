import { describe, it, expect } from "vitest";
import {
  createCustomCheckRunner,
  buildCustomChecks,
} from "../../src/core/checks/packs/custom/custom-runner.js";
import type { GitDiff, PreFlightConfig } from "../../src/shared/types.js";
import type { PreFlightContext } from "../../src/core/checks/check-contract.js";

// MARK: - Helpers

function makeDiff(
  files: Array<{
    path: string;
    status?: "added" | "modified" | "deleted";
  }> = [],
): GitDiff {
  return {
    baseBranch: "main",
    headBranch: "feat/custom-pack",
    changedFiles: files.map((f) => ({
      path: f.path,
      status: f.status ?? "modified",
    })),
    rawPatch: "",
  };
}

// MARK: - Tests

describe("Custom Runner — createCustomCheckRunner", () => {
  it("filters files matching fileExtensions", () => {
    const runner = createCustomCheckRunner({
      id: "rust:fmt",
      label: "Cargo Fmt",
      tool: "cargo",
      fileExtensions: [".rs"],
    });

    expect(runner.appliesTo(makeDiff([{ path: "src/main.rs" }]))).toBe(true);
    expect(runner.appliesTo(makeDiff([{ path: "src/index.ts" }]))).toBe(false);
  });

  it("filters files matching glob pattern", () => {
    const runner = createCustomCheckRunner({
      id: "custom:scripts",
      label: "ShellCheck",
      tool: "shellcheck",
      filesMatch: "scripts/**",
    });

    expect(runner.appliesTo(makeDiff([{ path: "scripts/build.sh" }]))).toBe(
      true,
    );
    expect(runner.appliesTo(makeDiff([{ path: "src/build.sh" }]))).toBe(false);
  });

  it("returns not-configured when tool is missing", async () => {
    const runner = createCustomCheckRunner({
      id: "rust:clippy",
      label: "Cargo Clippy",
      tool: "cargo",
      fileExtensions: [".rs"],
    });

    const diff = makeDiff([{ path: "src/lib.rs" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };

    const result = await runner.run(diff, context);
    expect(result.status).toBe("not-configured");
    expect(result.message).toContain("cargo is not installed");
  });

  it("executes tool with fixed args and passes on exit code 0", async () => {
    let capturedCmd = "";
    let capturedArgs: string[] = [];

    const runner = createCustomCheckRunner({
      id: "rust:fmt",
      label: "Cargo Fmt",
      tool: "cargo",
      args: ["fmt", "--check", "--"],
      appendChangedFiles: true,
      fileExtensions: [".rs"],
    });

    const diff = makeDiff([{ path: "src/lib.rs" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async (t) => (t === "cargo" ? "/bin/cargo" : null),
      runCommand: async (cmd, args) => {
        capturedCmd = cmd;
        capturedArgs = args;
        return { stdout: "", stderr: "", code: 0 };
      },
    };

    const result = await runner.run(diff, context);
    expect(result.status).toBe("pass");
    expect(capturedCmd).toBe("/bin/cargo");
    expect(capturedArgs).toEqual(["fmt", "--check", "--", "src/lib.rs"]);
  });

  it("parses findings on non-zero exit code", async () => {
    const runner = createCustomCheckRunner({
      id: "shell:check",
      label: "ShellCheck",
      tool: "shellcheck",
      fileExtensions: [".sh"],
    });

    const diff = makeDiff([{ path: "deploy.sh" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async (t) => (t === "shellcheck" ? "/bin/shellcheck" : null),
      runCommand: async () => ({
        stdout: "deploy.sh:12:1: Double quote to prevent globbing",
        stderr: "",
        code: 1,
      }),
    };

    const result = await runner.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("deploy.sh");
    expect(result.findings[0]?.line).toBe(12);
    expect(result.findings[0]?.column).toBe(1);
    expect(result.findings[0]?.message).toContain(
      "Double quote to prevent globbing",
    );
  });
});

describe("Custom Runner — buildCustomChecks", () => {
  it("builds checks from customPacks and customChecks", async () => {
    const config: PreFlightConfig = {
      targetBranch: "main",
      enabledPacks: ["rust"],
      blockingOnWarnings: false,
      gitHost: "github",
      diffScope: "branch",
      customPacks: [
        {
          id: "rust",
          label: "Rust",
          checks: [
            {
              id: "rust:fmt",
              label: "Cargo Fmt",
              tool: "cargo",
              args: ["fmt", "--check", "--"],
              fileExtensions: [".rs"],
              fixArgs: ["fmt", "--"],
            },
          ],
        },
      ],
      customChecks: [
        {
          id: "custom:shellcheck",
          label: "ShellCheck",
          tool: "shellcheck",
          fileExtensions: [".sh"],
        },
      ],
    };

    const runners = await buildCustomChecks(config, "/workspace");
    expect(runners).toHaveLength(2);
    expect(runners[0]?.id).toBe("rust:fmt");
    expect(runners[0]?.pack).toBe("rust");
    expect(runners[0]?.fixable).toBe(true);
    expect(runners[1]?.id).toBe("custom:shellcheck");
    expect(runners[1]?.pack).toBe("custom");
    expect(runners[1]?.fixable).toBe(false);
  });
});
