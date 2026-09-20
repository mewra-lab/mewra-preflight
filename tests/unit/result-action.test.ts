import { describe, expect, it } from "vitest";
import { resolveResultCommand } from "../../src/core/checks/result-action.js";
import { runChecks } from "../../src/core/checks/runner.js";
import {
  WebviewMessageSchema,
  ExtensionMessageSchema,
} from "../../src/shared/messages.js";
import type {
  CheckRunner,
  PreFlightContext,
} from "../../src/core/checks/check-contract.js";
import type { CheckStatus } from "../../src/shared/types.js";

const context: PreFlightContext = {
  workspaceRoot: "/workspace",
  resolveTool: async () => null,
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
};
function runner(status: CheckStatus = "pass"): CheckRunner {
  return {
    id: "companion:check",
    label: "Companion",
    severity: "error",
    pack: "companion",
    resultCommand: "companion.results",
    appliesTo: () => true,
    run: async () => ({ status, findings: [] }),
  };
}
async function snapshot(check: CheckRunner) {
  return runChecks(
    [check],
    {
      baseBranch: "main",
      headBranch: "feature",
      rawPatch: "",
      changedFiles: [],
    },
    context,
  );
}

describe("contributed result actions", () => {
  it.each(["pass", "warning", "fail", "not-configured", "skipped"] as const)(
    "preserves the command through validated %s snapshots",
    async (status) => {
      const check = runner(status),
        result = await snapshot(check);
      const parsed = ExtensionMessageSchema.parse({
        type: "snapshot",
        payload: result,
      });
      expect(parsed.type).toBe("snapshot");
      expect(resolveResultCommand(result, [check], check.id)).toBe(
        "companion.results",
      );
      if (parsed.type === "snapshot")
        expect(parsed.payload.checks[0]?.definition.resultCommand).toBe(
          "companion.results",
        );
    },
  );
  it("rejects unknown, disabled, revoked and changed registrations", async () => {
    const check = runner(),
      result = await snapshot(check);
    expect(resolveResultCommand(result, [check], "unknown")).toBeUndefined();
    expect(resolveResultCommand(result, [], check.id)).toBeUndefined();
    expect(
      resolveResultCommand(
        result,
        [{ ...check, resultCommand: "different.command" }],
        check.id,
      ),
    ).toBeUndefined();
    expect(resolveResultCommand(undefined, [check], check.id)).toBeUndefined();
  });
  it.each(["pending", "running"] as const)(
    "rejects unfinished %s results",
    async (status) => {
      const check = runner(status);
      expect(
        resolveResultCommand(await snapshot(check), [check], check.id),
      ).toBeUndefined();
    },
  );
  it("accepts only a check ID from the webview", () => {
    expect(
      WebviewMessageSchema.safeParse({
        type: "openCheckResults",
        checkId: "companion:check",
      }).success,
    ).toBe(true);
    for (const extra of [
      { command: "workbench.action.terminal.new" },
      { url: "https://example.test" },
      { args: ["shell"] },
    ]) {
      expect(
        WebviewMessageSchema.safeParse({
          type: "openCheckResults",
          checkId: "companion:check",
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
  it("keeps older checks without result commands compatible", async () => {
    const { resultCommand: omitted, ...check } = runner();
    expect(omitted).toBeDefined();
    expect(
      resolveResultCommand(await snapshot(check), [check], check.id),
    ).toBeUndefined();
  });
});
