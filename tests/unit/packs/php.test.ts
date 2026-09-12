import { describe, it, expect } from "vitest";
import { buildPhpPack } from "../../../src/core/checks/packs/php/index.js";
import type { GitDiff } from "../../../src/shared/types.js";
import type { PreFlightContext } from "../../../src/core/checks/check-contract.js";

// MARK: - Helpers

function makeDiff(
  files: Array<{
    path: string;
    status?: "added" | "modified" | "deleted";
  }> = [],
): GitDiff {
  return {
    baseBranch: "main",
    headBranch: "feat/php-api",
    changedFiles: files.map((f) => ({
      path: f.path,
      status: f.status ?? "modified",
    })),
    rawPatch: "",
  };
}

// MARK: - Tests

describe("PHP Pack — buildPhpPack", () => {
  it("returns all 3 PHP check runners", () => {
    const checks = buildPhpPack();
    expect(checks).toHaveLength(3);
    const ids = checks.map((c) => c.id);
    expect(ids).toContain("php:cs-fixer");
    expect(ids).toContain("php:analyze");
    expect(ids).toContain("php:test-pairing");
  });
});

describe("PHP Pack — cs-fixer", () => {
  it("returns not-configured when php-cs-fixer is not installed", async () => {
    const checks = buildPhpPack();
    const check = checks.find((c) => c.id === "php:cs-fixer")!;
    const diff = makeDiff([{ path: "src/User.php" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };

    const result = await check.run(diff, context);
    expect(result.status).toBe("not-configured");
  });

  it("passes when php-cs-fixer exits with 0", async () => {
    const checks = buildPhpPack();
    const check = checks.find((c) => c.id === "php:cs-fixer")!;
    const diff = makeDiff([{ path: "src/User.php" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async (t) =>
        t === "php-cs-fixer" ? "/vendor/bin/php-cs-fixer" : null,
      runCommand: async () => ({ stdout: "{}", stderr: "", code: 0 }),
    };

    const result = await check.run(diff, context);
    expect(result.status).toBe("pass");
    expect(result.findings).toHaveLength(0);
  });

  it("identifies unformatted files from JSON output", async () => {
    const checks = buildPhpPack();
    const check = checks.find((c) => c.id === "php:cs-fixer")!;
    const diff = makeDiff([{ path: "src/User.php" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async (t) =>
        t === "php-cs-fixer" ? "/vendor/bin/php-cs-fixer" : null,
      runCommand: async () => ({
        stdout: JSON.stringify({ files: [{ name: "src/User.php" }] }),
        stderr: "",
        code: 1,
      }),
    };

    const result = await check.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("src/User.php");
  });
});

describe("PHP Pack — analyze", () => {
  it("returns not-configured when neither phpstan nor psalm is installed", async () => {
    const checks = buildPhpPack();
    const check = checks.find((c) => c.id === "php:analyze")!;
    const diff = makeDiff([{ path: "src/User.php" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };

    const result = await check.run(diff, context);
    expect(result.status).toBe("not-configured");
  });

  it("parses PHPStan JSON findings", async () => {
    const checks = buildPhpPack();
    const check = checks.find((c) => c.id === "php:analyze")!;
    const diff = makeDiff([{ path: "src/User.php" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async (t) =>
        t === "phpstan" ? "/vendor/bin/phpstan" : null,
      runCommand: async () => ({
        stdout: JSON.stringify({
          totals: { errors: 1, file_errors: 1 },
          files: {
            "/workspace/src/User.php": {
              messages: [
                { message: "Call to undefined method foo()", line: 25 },
              ],
            },
          },
        }),
        stderr: "",
        code: 1,
      }),
    };

    const result = await check.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("src/User.php");
    expect(result.findings[0]?.line).toBe(25);
    expect(result.findings[0]?.message).toContain("Call to undefined method");
  });

  it("falls back to Psalm when PHPStan is not installed", async () => {
    const checks = buildPhpPack();
    const check = checks.find((c) => c.id === "php:analyze")!;
    const diff = makeDiff([{ path: "src/Order.php" }]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async (t) => (t === "psalm" ? "/vendor/bin/psalm" : null),
      runCommand: async () => ({
        stdout: JSON.stringify([
          {
            file_path: "/workspace/src/Order.php",
            line_from: 40,
            message: "UndefinedVariable: Cannot find $total",
          },
        ]),
        stderr: "",
        code: 2,
      }),
    };

    const result = await check.run(diff, context);
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("src/Order.php");
    expect(result.findings[0]?.line).toBe(40);
  });
});

describe("PHP Pack — test-pairing", () => {
  it("warns when a new PHP class has no matching test file", async () => {
    const checks = buildPhpPack();
    const check = checks.find((c) => c.id === "php:test-pairing")!;
    const diff = makeDiff([
      { path: "src/PaymentGateway.php", status: "added" },
    ]);
    const context: PreFlightContext = {
      workspaceRoot: "/workspace",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };

    const result = await check.run(diff, context);
    expect(result.status).toBe("warning");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("src/PaymentGateway.php");
    expect(result.findings[0]?.message).toContain("PaymentGatewayTest.php");
  });
});
