import { describe, it, expect } from "vitest";
import { buildGoPack } from "../../../src/core/checks/packs/go/index.js";
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
    headBranch: "feat/go-service",
    changedFiles: files.map((f) => ({
      path: f.path,
      status: f.status ?? "modified",
    })),
    rawPatch: "",
  };
}

describe("Go Pack — buildGoPack", () => {
  it("returns all 4 Go check runners", () => {
    const checks = buildGoPack();
    expect(checks).toHaveLength(4);
    const ids = checks.map((c) => c.id);
    expect(ids).toContain("go:gofmt");
    expect(ids).toContain("go:govet");
    expect(ids).toContain("go:golangci-lint");
    expect(ids).toContain("go:test-pairing");
  });
});

describe("Go Pack — gofmt", () => {
  it("returns not-configured when gofmt is missing", async () => {
    const checks = buildGoPack();
    const gofmt = checks.find((c) => c.id === "go:gofmt")!;
    const diff = makeDiff([{ path: "main.go" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };
    const result = await gofmt.run(diff, context);
    expect(result.status).toBe("not-configured");
  });

  it("passes when gofmt returns no unformatted files", async () => {
    const checks = buildGoPack();
    const gofmt = checks.find((c) => c.id === "go:gofmt")!;
    const diff = makeDiff([{ path: "main.go" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => "/usr/bin/gofmt",
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };
    const result = await gofmt.run(diff, context);
    expect(result.status).toBe("pass");
  });

  it("fails when gofmt outputs unformatted files", async () => {
    const checks = buildGoPack();
    const gofmt = checks.find((c) => c.id === "go:gofmt")!;
    const diff = makeDiff([{ path: "pkg/auth/auth.go" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => "/usr/bin/gofmt",
      runCommand: async () => ({
        stdout: "pkg/auth/auth.go\n",
        stderr: "",
        code: 0,
      }),
    };
    const result = await gofmt.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("pkg/auth/auth.go");
  });
});

describe("Go Pack — go vet", () => {
  it("parses compiler errors from stderr", async () => {
    const checks = buildGoPack();
    const govet = checks.find((c) => c.id === "go:govet")!;
    const diff = makeDiff([{ path: "main.go" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => "/usr/bin/go",
      runCommand: async () => ({
        stdout: "",
        stderr: "main.go:10:2: unreachable code\n",
        code: 1,
      }),
    };
    const result = await govet.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("main.go");
    expect(result.findings[0]?.line).toBe(10);
    expect(result.findings[0]?.message).toBe("unreachable code");
  });
});

describe("Go Pack — golangci-lint", () => {
  it("parses JSON issues from golangci-lint", async () => {
    const checks = buildGoPack();
    const lint = checks.find((c) => c.id === "go:golangci-lint")!;
    const diff = makeDiff([{ path: "service.go" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => "/usr/local/bin/golangci-lint",
      runCommand: async () => ({
        stdout: JSON.stringify({
          Issues: [
            {
              FromLinter: "errcheck",
              Text: "Error return value is not checked",
              Pos: { Filename: "service.go", Line: 25 },
            },
          ],
        }),
        stderr: "",
        code: 1,
      }),
    };
    const result = await lint.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("service.go");
    expect(result.findings[0]?.line).toBe(25);
    expect(result.findings[0]?.rule).toBe("errcheck");
  });
});

describe("Go Pack — test pairing", () => {
  it("warns when added .go file is missing _test.go", async () => {
    const checks = buildGoPack();
    const testPairing = checks.find((c) => c.id === "go:test-pairing")!;
    const diff = makeDiff([{ path: "pkg/calc/calc.go", status: "added" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/nonexistent-test-dir",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };
    const result = await testPairing.run(diff, context);
    expect(result.status).toBe("warning");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("pkg/calc/calc.go");
  });

  it("passes when added .go file has matching _test.go in diff", async () => {
    const checks = buildGoPack();
    const testPairing = checks.find((c) => c.id === "go:test-pairing")!;
    const diff = makeDiff([
      { path: "pkg/calc/calc.go", status: "added" },
      { path: "pkg/calc/calc_test.go", status: "added" },
    ]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };
    const result = await testPairing.run(diff, context);
    expect(result.status).toBe("pass");
    expect(result.findings).toHaveLength(0);
  });
});
