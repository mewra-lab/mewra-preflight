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
    expect(body).toContain("### ESLint (fail)");
    expect(body).toContain("`src/api.ts:10`: unused var");
  });
});
