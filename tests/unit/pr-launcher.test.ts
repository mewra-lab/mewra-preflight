import { describe, it, expect } from "vitest";
import {
  remoteToHttps,
  formatBranchTitle,
  formatPRBody,
} from "../../src/core/pr/pr-launcher.js";
import type { PreFlightSnapshot } from "../../src/shared/types.js";

describe("remoteToHttps", () => {
  it("converts SSH remote to HTTPS", () => {
    expect(remoteToHttps("git@github.com:mewra-lab/mewra-preflight.git")).toBe(
      "https://github.com/mewra-lab/mewra-preflight",
    );
  });

  it("leaves HTTPS remote unchanged except stripping .git", () => {
    expect(
      remoteToHttps("https://github.com/mewra-lab/mewra-preflight.git"),
    ).toBe("https://github.com/mewra-lab/mewra-preflight");
  });

  it("handles remote without .git suffix", () => {
    expect(remoteToHttps("git@gitlab.com:org/repo")).toBe(
      "https://gitlab.com/org/repo",
    );
  });
});

describe("formatBranchTitle", () => {
  it("formats feature branch name into title", () => {
    expect(formatBranchTitle("feat/auth-v2")).toBe("feat: auth v2");
    expect(formatBranchTitle("fix/header-logo")).toBe("fix: header logo");
    expect(formatBranchTitle("quick-fix")).toBe("quick fix");
  });
});

describe("formatPRBody", () => {
  it("formats PR body with commits and check snapshot findings", () => {
    const snapshot: PreFlightSnapshot = {
      runId: "123",
      startedAt: 1000,
      checks: [
        {
          definition: {
            id: "lint",
            label: "ESLint",
            severity: "error",
            pack: "js-ts",
          },
          result: {
            status: "fail",
            findings: [{ file: "src/api.ts", line: 10, message: "unused var" }],
          },
        },
      ],
      manualChecks: [],
      overallStatus: "fail",
    };

    const body = formatPRBody(
      "feat/login",
      "main",
      ["feat: add login page", "fix: types"],
      snapshot,
    );

    expect(body).toContain("Source branch: `feat/login`");
    expect(body).toContain("Target branch: `main`");
    expect(body).toContain("- feat: add login page");
    expect(body).toContain("Overall Status: **FAIL**");
    expect(body).toContain("**ESLint (fail)**");
    expect(body).toContain("`src/api.ts:10`: unused var");
    expect(body).not.toContain("## Summary");
    expect(body).toContain("Summary\n-------");
  });

  it("collapses commits list when more than 5 commits", () => {
    const commits = [
      "c1 feat: one",
      "c2 feat: two",
      "c3 feat: three",
      "c4 feat: four",
      "c5 feat: five",
      "c6 feat: six",
    ];
    const body = formatPRBody("feat/multi", "main", commits);
    expect(body).toContain("<details>");
    expect(body).toContain("<summary>View all 6 commits</summary>");
    expect(body).toContain("- c1 feat: one");
    expect(body).toContain("- c6 feat: six");
  });

  it("preserves ampersands in branch names and commit messages", () => {
    const body = formatPRBody("feat/search&filter", "main", ["fix: a & b"]);

    expect(body).toContain("`feat/search&filter`");
    expect(body).toContain("- fix: a & b");
  });

  it("attaches per-route mermaid sections from pounce check results", () => {
    const snapshot: PreFlightSnapshot = {
      runId: "456",
      startedAt: 1000,
      checks: [
        {
          definition: {
            id: "pounce:blast-radius",
            label: "Mewra Pounce — Blast Radius",
            severity: "warning",
            pack: "pounce",
          },
          result: {
            status: "warning",
            findings: [
              {
                file: "src/routes/user.ts",
                line: 3,
                message: "Entry point reached: GET /api/users",
              },
            ],
            mermaid:
              'graph TD\n  EP_0["GET /api/users"]\n  F_0["📄 routes/user.ts"]\n  EP_0 --> F_0',
            routes: [
              {
                method: "GET",
                route: "/api/users",
                file: "src/routes/user.ts",
                line: 3,
              },
              {
                method: "POST",
                route: "/api/users",
                file: "src/routes/user.ts",
                line: 12,
              },
            ],
          },
        },
      ],
      manualChecks: [],
      overallStatus: "warning",
    };

    const body = formatPRBody("feat/api", "main", [], snapshot);

    expect(body).toContain("Blast Radius — Impacted Entry Points");
    expect(body).not.toContain("## ");
    expect(body).toContain("<details open>");
    expect(body).toContain("<code>GET /api/users</code>");
    expect(body).toContain("<code>POST /api/users</code>");
    expect(body).toContain("```mermaid");
    expect(body).toContain("graph TD");
    expect(body).toContain('EP["GET /api/users"]');
    expect(body).toContain('EP["POST /api/users"]');
  });

  it("does not add mermaid block when no pounce checks", () => {
    const body = formatPRBody("feat/simple", "main", [], undefined);
    expect(body).not.toContain("<details open>");
    expect(body).not.toContain("```mermaid");
  });
});
