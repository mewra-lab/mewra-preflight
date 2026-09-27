import { describe, expect, it } from "vitest";
import {
  assertSnapshotInputsCurrent,
  effectiveMcpConfig,
  snapshotInputs,
} from "../../src/core/mcp/snapshot-policy.js";
import type { GitDiff } from "../../src/shared/types.js";

const diff: GitDiff = {
  baseBranch: "main",
  headBranch: "feature",
  scope: "working",
  changedFiles: [{ path: "src/app.ts", status: "modified" }],
  rawPatch: "+debugger;",
};

describe("MCP snapshot policy", () => {
  it("accepts unchanged pipeline inputs", () => {
    expect(() =>
      assertSnapshotInputsCurrent(
        snapshotInputs(diff, null, undefined),
        snapshotInputs({ ...diff }, null, undefined),
      ),
    ).not.toThrow();
  });
  it("rejects stale diff, config, and ignore policy", () => {
    const expected = snapshotInputs(diff, null, undefined);
    expect(() =>
      assertSnapshotInputsCurrent(
        expected,
        snapshotInputs({ ...diff, rawPatch: "+fixed();" }, null, undefined),
      ),
    ).toThrow("inputs changed");
    expect(() =>
      assertSnapshotInputsCurrent(
        expected,
        snapshotInputs(
          diff,
          { ecosystems: { "js-ts": { enabled: false } } },
          undefined,
        ),
      ),
    ).toThrow("inputs changed");
    expect(() =>
      assertSnapshotInputsCurrent(
        expected,
        snapshotInputs(diff, null, { globalIgnores: [] }),
      ),
    ).toThrow("inputs changed");
  });
  it("revokes manual mutation as soon as an item's agent authority is removed", () => {
    const mcp = { agentCheckableManualChecks: ["migration", "unknown"] };
    expect(
      effectiveMcpConfig({
        mcp,
        manualChecklist: [
          { id: "migration", label: "Migration", agentCheckable: true },
        ],
      })?.agentCheckableManualChecks,
    ).toEqual(["migration"]);
    expect(
      effectiveMcpConfig({
        mcp,
        manualChecklist: [
          { id: "migration", label: "Migration", agentCheckable: false },
        ],
      })?.agentCheckableManualChecks,
    ).toEqual([]);
  });
});
