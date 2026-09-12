import { describe, it, expect } from "vitest";
import { PreFlightMcpHandler } from "../../src/core/mcp/handler.js";
import type {
  CheckRunner,
  PreFlightContext,
} from "../../src/core/checks/check-contract.js";
import type { GitDiff, PreFlightSnapshot } from "../../src/shared/types.js";

const mockDiff: GitDiff = {
  baseBranch: "main",
  headBranch: "feat/mcp",
  changedFiles: [{ path: "src/app.ts", status: "modified" }],
  rawPatch: "+const a = 1;",
};

const mockContext: PreFlightContext = {
  workspaceRoot: "/mock",
  resolveTool: async () => null,
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
};

const sampleCheck: CheckRunner = {
  id: "universal:test",
  label: "Test Check",
  severity: "error",
  pack: "universal",
  appliesTo: () => true,
  run: async () => ({
    status: "fail",
    findings: [
      { file: "src/app.ts", line: 10, message: "Sample error", rule: "test" },
    ],
  }),
};

describe("PreFlightMcpHandler — tools", () => {
  it("returns latest snapshot via get_preflight_status", () => {
    const handler = new PreFlightMcpHandler(() => [sampleCheck]);
    expect(handler.get_preflight_status()).toBeNull();

    const snapshot: PreFlightSnapshot = {
      runId: "123",
      startedAt: Date.now(),
      diff: mockDiff,
      checks: [
        {
          definition: {
            id: "universal:test",
            label: "Test",
            severity: "error",
            pack: "universal",
          },
          result: {
            status: "fail",
            findings: [
              {
                file: "src/app.ts",
                line: 10,
                message: "Sample error",
                rule: "test",
              },
            ],
          },
        },
      ],
      overallStatus: "fail",
    };

    handler.updateSnapshot(snapshot);
    expect(handler.get_preflight_status()?.runId).toBe("123");
  });

  it("returns check findings for specific checkId via get_check_findings", () => {
    const handler = new PreFlightMcpHandler(() => [sampleCheck]);
    const snapshot: PreFlightSnapshot = {
      runId: "123",
      startedAt: Date.now(),
      checks: [
        {
          definition: {
            id: "universal:test",
            label: "Test",
            severity: "error",
            pack: "universal",
          },
          result: {
            status: "fail",
            findings: [
              {
                file: "src/app.ts",
                line: 10,
                message: "Sample error",
                rule: "test",
              },
            ],
          },
        },
      ],
      overallStatus: "fail",
    };
    handler.updateSnapshot(snapshot);

    const findings = handler.get_check_findings("universal:test");
    expect(findings.length).toBe(1);
    expect(findings[0]?.message).toBe("Sample error");

    expect(handler.get_check_findings("unknown:check")).toEqual([]);
  });

  it("re-runs registered check and rejects unknown checks via run_check", async () => {
    const handler = new PreFlightMcpHandler(() => [sampleCheck]);
    const res = await handler.run_check(
      "universal:test",
      mockDiff,
      mockContext,
    );
    expect(res.status).toBe("fail");
    expect(res.findings.length).toBe(1);

    await expect(
      handler.run_check("malicious:command", mockDiff, mockContext),
    ).rejects.toThrowError('Unknown checkId "malicious:command"');
  });
});

describe("PreFlightMcpHandler — resources", () => {
  it("serves preflight://dashboard and preflight://pr-draft", () => {
    const handler = new PreFlightMcpHandler(() => []);
    expect(handler.getResource("preflight://dashboard")).toBeNull();

    handler.setDraftPR({ title: "feat: add mcp", body: "Adds MCP tools" });
    const draft = handler.getResource("preflight://pr-draft") as {
      title: string;
      body: string;
    };
    expect(draft.title).toBe("feat: add mcp");

    expect(handler.getResource("unknown://uri")).toBeNull();
  });
});
