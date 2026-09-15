import { describe, it, expect, vi } from "vitest";
import { runChecks } from "../../src/core/checks/runner.js";
import { parsePreflightIgnore } from "../../src/core/config/preflight-ignore.js";
import type {
  CheckRunner,
  PreFlightContext,
} from "../../src/core/checks/check-contract.js";
import type { GitDiff } from "../../src/shared/types.js";

const MOCK_DIFF: GitDiff = {
  baseBranch: "main",
  headBranch: "feat/test",
  changedFiles: [{ path: "src/foo.ts", status: "modified" }],
  rawPatch: "+const x = 1;",
};

const CONTEXT: PreFlightContext = {
  workspaceRoot: "/tmp/test",
  resolveTool: async () => null,
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
};

function makeCheck(overrides: Partial<CheckRunner>): CheckRunner {
  return {
    id: "test:check",
    label: "Test Check",
    severity: "error",
    pack: "test",
    appliesTo: () => true,
    run: async () => ({ status: "pass", findings: [] }),
    ...overrides,
  };
}

describe("runChecks", () => {
  it("runs applicable checks and returns a snapshot", async () => {
    const check1 = makeCheck({ id: "c1", label: "Check 1" });
    const check2 = makeCheck({ id: "c2", label: "Check 2" });

    const snapshot = await runChecks([check1, check2], MOCK_DIFF, CONTEXT);

    expect(snapshot.overallStatus).toBe("pass");
    expect(snapshot.checks).toHaveLength(2);
    expect(snapshot.checks[0]?.result.status).toBe("pass");
    expect(snapshot.checks[1]?.result.status).toBe("pass");
  });

  it("marks non-applicable checks as skipped", async () => {
    const check = makeCheck({
      id: "c1",
      appliesTo: () => false,
    });

    const snapshot = await runChecks([check], MOCK_DIFF, CONTEXT);

    expect(snapshot.checks[0]?.result.status).toBe("skipped");
    expect(snapshot.overallStatus).toBe("pass");
  });

  it("sets overallStatus to fail if any error-severity check fails", async () => {
    const checkPass = makeCheck({ id: "c1" });
    const checkFail = makeCheck({
      id: "c2",
      severity: "error",
      run: async () => ({ status: "fail", findings: [] }),
    });

    const snapshot = await runChecks(
      [checkPass, checkFail],
      MOCK_DIFF,
      CONTEXT,
    );

    expect(snapshot.overallStatus).toBe("fail");
  });

  it("sets overallStatus to warning if only warning checks fail", async () => {
    const checkWarning = makeCheck({
      id: "c1",
      severity: "warning",
      run: async () => ({ status: "warning", findings: [] }),
    });

    const snapshot = await runChecks([checkWarning], MOCK_DIFF, CONTEXT);

    expect(snapshot.overallStatus).toBe("warning");
  });

  it("ignores not-configured status for overall verdict", async () => {
    const checkMissing = makeCheck({
      id: "c1",
      run: async () => ({ status: "not-configured", findings: [] }),
    });

    const snapshot = await runChecks([checkMissing], MOCK_DIFF, CONTEXT);

    expect(snapshot.overallStatus).toBe("pass");
  });

  it("calls onProgress for each check transition", async () => {
    const progress = vi.fn();
    const check = makeCheck({ id: "c1" });

    await runChecks([check], MOCK_DIFF, CONTEXT, progress);

    expect(progress).toHaveBeenCalled();
  });

  it("sets overallStatus to fail if an error manual check is unchecked", async () => {
    const check = makeCheck({ id: "c1" });
    const manualChecks = [
      {
        id: "m1",
        label: "Migration",
        severity: "error" as const,
        checked: false,
        triggered: true,
      },
    ];

    const snapshot = await runChecks(
      [check],
      MOCK_DIFF,
      CONTEXT,
      undefined,
      manualChecks,
    );

    expect(snapshot.overallStatus).toBe("fail");
    expect(snapshot.manualChecks).toHaveLength(1);
  });

  it("sets overallStatus to pass when all manual checks are checked", async () => {
    const check = makeCheck({ id: "c1" });
    const manualChecks = [
      {
        id: "m1",
        label: "Migration",
        severity: "error" as const,
        checked: true,
        triggered: true,
      },
    ];

    const snapshot = await runChecks(
      [check],
      MOCK_DIFF,
      CONTEXT,
      undefined,
      manualChecks,
    );

    expect(snapshot.overallStatus).toBe("pass");
  });

  it("marks check as skipped when all files are targeted in preflight ignore", async () => {
    const check = makeCheck({
      id: "universal:no-console-log",
      pack: "universal",
      run: async () => ({
        status: "fail",
        findings: [
          { file: "scripts/dev.ts", line: 10, message: "console.log found" },
        ],
      }),
    });
    const rules = parsePreflightIgnore("scripts/**: universal:no-console-log");
    const snapshot = await runChecks(
      [check],
      {
        baseBranch: "main",
        headBranch: "feat/test",
        changedFiles: [{ path: "scripts/dev.ts", status: "modified" }],
        rawPatch: "+console.log()",
      },
      CONTEXT,
      undefined,
      [],
      rules,
    );
    expect(snapshot.checks[0]?.result.status).toBe("skipped");
    expect(snapshot.overallStatus).toBe("pass");
  });

  it("filters findings and passes when some files are targeted in preflight ignore", async () => {
    const run = vi.fn(async () => ({
      status: "fail" as const,
      findings: [
        { file: "scripts/dev.ts", line: 10, message: "console.log found" },
      ],
    }));
    const check = makeCheck({
      id: "universal:no-console-log",
      pack: "universal",
      run,
    });
    const rules = parsePreflightIgnore("scripts/**: universal:no-console-log");
    const snapshot = await runChecks(
      [check],
      {
        baseBranch: "main",
        headBranch: "feat/test",
        changedFiles: [
          { path: "src/index.ts", status: "modified" },
          { path: "scripts/dev.ts", status: "modified" },
        ],
        rawPatch: "+console.log()",
      },
      CONTEXT,
      undefined,
      [],
      rules,
    );
    expect(snapshot.checks[0]?.result.status).toBe("pass");
    expect(snapshot.checks[0]?.result.findings).toHaveLength(0);
    expect(snapshot.overallStatus).toBe("pass");
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        changedFiles: [{ path: "src/index.ts", status: "modified" }],
        rawPatch: "",
      }),
      CONTEXT,
    );
  });

  it("promotes warning check to pass when all routes are filtered by targeted preflight ignore", async () => {
    const check = makeCheck({
      id: "pounce:blast-radius",
      pack: "pounce",
      severity: "warning",
      run: async () => ({
        status: "warning",
        findings: [
          {
            file: "scripts/seed.ts",
            line: 5,
            message: "Entry point reached: GET /seed",
          },
        ],
        routes: [
          { method: "GET", route: "/seed", file: "scripts/seed.ts", line: 5 },
        ],
      }),
    });
    const rules = parsePreflightIgnore("scripts/**: pounce:blast-radius");
    const snapshot = await runChecks(
      [check],
      {
        baseBranch: "main",
        headBranch: "feat/test",
        changedFiles: [
          { path: "src/app.ts", status: "modified" },
          { path: "scripts/seed.ts", status: "modified" },
        ],
        rawPatch: "+export async function GET() {}",
      },
      CONTEXT,
      undefined,
      [],
      rules,
    );
    expect(snapshot.checks[0]?.result.status).toBe("pass");
    expect(snapshot.checks[0]?.result.findings).toHaveLength(0);
    expect(snapshot.checks[0]?.result.routes).toHaveLength(0);
    expect(snapshot.overallStatus).toBe("pass");
  });

  it("marks check as skipped when all files match a global preflight ignore pattern", async () => {
    const check = makeCheck({
      id: "pounce:blast-radius",
      pack: "pounce",
      severity: "warning",
      run: async () => ({
        status: "warning",
        findings: [
          {
            file: "scripts/seed.ts",
            line: 5,
            message: "Entry point reached: GET /seed",
          },
        ],
        routes: [
          { method: "GET", route: "/seed", file: "scripts/seed.ts", line: 5 },
        ],
      }),
    });
    const rules = parsePreflightIgnore("scripts/**");
    const snapshot = await runChecks(
      [check],
      {
        baseBranch: "main",
        headBranch: "feat/test",
        changedFiles: [{ path: "scripts/seed.ts", status: "modified" }],
        rawPatch: "+export async function GET() {}",
      },
      CONTEXT,
      undefined,
      [],
      rules,
    );
    expect(snapshot.checks[0]?.result.status).toBe("skipped");
    expect(snapshot.overallStatus).toBe("pass");
  });
});
