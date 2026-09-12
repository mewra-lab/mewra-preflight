import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Types

type GolangCiIssue = {
  FromLinter?: string;
  Text?: string;
  Pos?: {
    Filename?: string;
    Line?: number;
  };
};

type GolangCiReport = {
  Issues?: GolangCiIssue[];
};

// MARK: - Constants

const LINT_LINE_PATTERN = /^([^:\s]+):(\d+):(?:\d+:)?\s*(.+)$/;

// MARK: - Helpers

function changedGoPackages(diff: GitDiff): string[] {
  const dirs = new Set<string>();
  for (const f of diff.changedFiles) {
    if (f.status !== "deleted" && f.path.endsWith(".go")) {
      const idx = f.path.lastIndexOf("/");
      const dir = idx !== -1 ? `./${f.path.slice(0, idx)}/...` : "./...";
      dirs.add(dir);
    }
  }
  return Array.from(dirs);
}

// MARK: - Check Definition

export const golangciCheck: CheckRunner = {
  id: "go:golangci-lint",
  label: "golangci-lint",
  severity: "error",
  pack: "go",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some(
      (f) => f.status !== "deleted" && f.path.endsWith(".go"),
    );
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const packages = changedGoPackages(diff);
    const tool = await context.resolveTool("golangci-lint");

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message: "golangci-lint is not installed in local PATH or ~/go/bin.",
      };
    }

    const { stdout, stderr, code } = await context.runCommand(tool, [
      "run",
      "--out-format=json",
      ...(packages.length > 0 ? packages : ["./..."]),
    ]);

    if (code === 0) {
      return { status: "pass", findings: [] };
    }

    const findings: CheckFinding[] = [];

    try {
      const report = JSON.parse(stdout) as GolangCiReport;
      if (Array.isArray(report.Issues)) {
        for (const issue of report.Issues) {
          if (issue.Pos?.Filename && issue.Text) {
            findings.push({
              file: issue.Pos.Filename,
              line: issue.Pos.Line ?? 0,
              message: issue.Text,
              rule: issue.FromLinter ?? "golangci-lint",
            });
          }
        }
      }
    } catch {
      const outputLines = `${stdout}\n${stderr}`.split("\n");
      for (const line of outputLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const match = LINT_LINE_PATTERN.exec(trimmed);
        if (match && match[1] && match[2] && match[3]) {
          findings.push({
            file: match[1],
            line: parseInt(match[2], 10),
            message: match[3],
            rule: "golangci-lint",
          });
        }
      }
    }

    return {
      status: findings.length > 0 || code !== 0 ? "fail" : "pass",
      findings,
    };
  },
};
