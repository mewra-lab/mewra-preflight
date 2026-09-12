import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Helpers

function changedGoFiles(diff: GitDiff): string[] {
  return diff.changedFiles
    .filter((f) => f.status !== "deleted" && f.path.endsWith(".go"))
    .map((f) => f.path);
}

// MARK: - Check Definition

export const gofmtCheck: CheckRunner = {
  id: "go:gofmt",
  label: "gofmt",
  severity: "error",
  pack: "go",

  appliesTo(diff: GitDiff): boolean {
    return changedGoFiles(diff).length > 0;
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const files = changedGoFiles(diff);
    const tool = await context.resolveTool("gofmt");

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message: "gofmt is not found in Go toolchain or PATH.",
      };
    }

    const { stdout, code } = await context.runCommand(tool, ["-l", ...files]);

    if (code !== 0 && !stdout.trim()) {
      return { status: "fail", findings: [] };
    }

    const unformatted = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const findings: CheckFinding[] = unformatted.map((file) => ({
      file,
      line: 0,
      message: "File is not formatted according to gofmt standards.",
      rule: "gofmt",
    }));

    return {
      status: findings.length > 0 ? "fail" : "pass",
      findings,
    };
  },
};
