import { describe, it, expect } from "vitest";
import { buildPythonPack } from "../../../src/core/checks/packs/python/index.js";
import type { GitDiff } from "../../../src/shared/types.js";
import type { PreFlightContext } from "../../../src/core/checks/check-contract.js";

function makeDiff(
  files: Array<{
    path: string;
    status?: "added" | "modified" | "deleted";
  }> = [],
): GitDiff {
  return {
    baseBranch: "main",
    headBranch: "feat/python-api",
    changedFiles: files.map((f) => ({
      path: f.path,
      status: f.status ?? "modified",
    })),
    rawPatch: "",
  };
}

describe("Python Pack — buildPythonPack", () => {
  it("returns all 4 Python check runners", () => {
    const checks = buildPythonPack();
    expect(checks).toHaveLength(4);
    const ids = checks.map((c) => c.id);
    expect(ids).toContain("python:format");
    expect(ids).toContain("python:lint");
    expect(ids).toContain("python:mypy");
    expect(ids).toContain("python:test-pairing");
  });
});

describe("Python Pack — format", () => {
  it("returns not-configured when neither ruff nor black is installed", async () => {
    const checks = buildPythonPack();
    const format = checks.find((c) => c.id === "python:format")!;
    const diff = makeDiff([{ path: "app.py" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };
    const result = await format.run(diff, context);
    expect(result.status).toBe("not-configured");
  });

  it("identifies unformatted files with ruff", async () => {
    const checks = buildPythonPack();
    const format = checks.find((c) => c.id === "python:format")!;
    const diff = makeDiff([{ path: "services/user.py" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async (tool) => (tool === "ruff" ? "/venv/bin/ruff" : null),
      runCommand: async () => ({
        stdout: "Would reformat: services/user.py\n",
        stderr: "",
        code: 1,
      }),
    };
    const result = await format.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("services/user.py");
    expect(result.findings[0]?.rule).toBe("ruff-format");
  });

  it("falls back to black when ruff is missing", async () => {
    const checks = buildPythonPack();
    const format = checks.find((c) => c.id === "python:format")!;
    const diff = makeDiff([{ path: "main.py" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async (tool) =>
        tool === "black" ? "/venv/bin/black" : null,
      runCommand: async () => ({
        stdout: "would reformat main.py\n",
        stderr: "",
        code: 1,
      }),
    };
    const result = await format.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("main.py");
    expect(result.findings[0]?.rule).toBe("black");
  });
});

describe("Python Pack — lint", () => {
  it("parses JSON findings from ruff", async () => {
    const checks = buildPythonPack();
    const lint = checks.find((c) => c.id === "python:lint")!;
    const diff = makeDiff([{ path: "api.py" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async (tool) => (tool === "ruff" ? "/venv/bin/ruff" : null),
      runCommand: async () => ({
        stdout: JSON.stringify([
          {
            code: "F401",
            message: "`os` imported but unused",
            filename: "api.py",
            location: { row: 3, column: 1 },
          },
        ]),
        stderr: "",
        code: 1,
      }),
    };
    const result = await lint.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("api.py");
    expect(result.findings[0]?.line).toBe(3);
    expect(result.findings[0]?.message).toBe("`os` imported but unused");
    expect(result.findings[0]?.rule).toBe("F401");
  });
});

describe("Python Pack — mypy", () => {
  it("parses mypy error output", async () => {
    const checks = buildPythonPack();
    const mypy = checks.find((c) => c.id === "python:mypy")!;
    const diff = makeDiff([{ path: "types.py" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => "/venv/bin/mypy",
      runCommand: async () => ({
        stdout:
          "types.py:15: error: Incompatible types in assignment [assignment]\n",
        stderr: "",
        code: 1,
      }),
    };
    const result = await mypy.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("types.py");
    expect(result.findings[0]?.line).toBe(15);
    expect(result.findings[0]?.rule).toBe("assignment");
  });
});

describe("Python Pack — test pairing", () => {
  it("ignores __init__.py and conftest.py", () => {
    const checks = buildPythonPack();
    const pairing = checks.find((c) => c.id === "python:test-pairing")!;
    const diff = makeDiff([
      { path: "src/__init__.py", status: "added" },
      { path: "tests/conftest.py", status: "added" },
    ]);
    expect(pairing.appliesTo(diff)).toBe(false);
  });

  it("warns when added module has no test file", async () => {
    const checks = buildPythonPack();
    const pairing = checks.find((c) => c.id === "python:test-pairing")!;
    const diff = makeDiff([{ path: "src/auth.py", status: "added" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/nonexistent-python-dir",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };
    const result = await pairing.run(diff, context);
    expect(result.status).toBe("warning");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("src/auth.py");
  });

  it("passes when matching test file is in diff", async () => {
    const checks = buildPythonPack();
    const pairing = checks.find((c) => c.id === "python:test-pairing")!;
    const diff = makeDiff([
      { path: "src/auth.py", status: "added" },
      { path: "tests/test_auth.py", status: "added" },
    ]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };
    const result = await pairing.run(diff, context);
    expect(result.status).toBe("pass");
  });
});
