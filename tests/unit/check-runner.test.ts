import { describe, it, expect, vi } from "vitest";
import { runChecks } from "../../src/core/checks/runner.js";
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

const CONTEXT: PreFlightContext = { workspaceRoot: "/tmp/test" };

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
  it("returns pass snapshot when all checks pass", async () => {
    const progress = vi.fn();
    const snapshot = await runChecks(
      [makeCheck({})],
      MOCK_DIFF,
      CONTEXT,
      progress,
    );
    expect(snapshot.overallStatus).toBe("pass");
    expect(snapshot.checks[0]?.result.status).toBe("pass");
  });

  it("returns fail snapshot when a check fails", async () => {
    const failing = makeCheck({
      run: async () => ({
        status: "fail",
        findings: [{ file: "src/foo.ts", line: 1, message: "oops" }],
      }),
    });
    const progress = vi.fn();
    const snapshot = await runChecks([failing], MOCK_DIFF, CONTEXT, progress);
    expect(snapshot.overallStatus).toBe("fail");
  });

  it("marks check as skipped when appliesTo returns false", async () => {
    const skipped = makeCheck({ appliesTo: () => false });
    const progress = vi.fn();
    const snapshot = await runChecks([skipped], MOCK_DIFF, CONTEXT, progress);
    expect(snapshot.checks[0]?.result.status).toBe("skipped");
  });

  it("catches unexpected check errors and marks as fail", async () => {
    const throwing = makeCheck({
      run: async () => {
        throw new Error("boom");
      },
    });
    const progress = vi.fn();
    const snapshot = await runChecks([throwing], MOCK_DIFF, CONTEXT, progress);
    expect(snapshot.checks[0]?.result.status).toBe("fail");
  });

  it("calls onProgress with pending state before running", async () => {
    const progress = vi.fn();
    await runChecks([makeCheck({})], MOCK_DIFF, CONTEXT, progress);
    const firstCall = progress.mock.calls[0]?.[0];
    expect(firstCall?.checks[0]?.result.status).toBe("pending");
  });

  it("populates finishedAt on final snapshot", async () => {
    const progress = vi.fn();
    const snapshot = await runChecks(
      [makeCheck({})],
      MOCK_DIFF,
      CONTEXT,
      progress,
    );
    expect(snapshot.finishedAt).toBeDefined();
    expect(snapshot.finishedAt).toBeGreaterThanOrEqual(snapshot.startedAt);
  });
});
