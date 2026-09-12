import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const MYPY_LINE_PATTERN =
  /^([^:\s]+):(\d+)(?::\d+)?: (error|warning): (.+?)(?: \[([^\]]+)\])?$/;

// MARK: - Helpers

function changedPythonFiles(diff: GitDiff): string[] {
  return diff.changedFiles
    .filter((f) => f.status !== "deleted" && f.path.endsWith(".py"))
    .map((f) => f.path);
}

// MARK: - Check Definition

export const mypyCheck: CheckRunner = {
  id: "python:mypy",
  label: "mypy",
  severity: "error",
  pack: "python",

  appliesTo(diff: GitDiff): boolean {
    return changedPythonFiles(diff).length > 0;
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const files = changedPythonFiles(diff);
    const tool = await context.resolveTool("mypy");

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message: "mypy is not installed in local venv (.venv), uv, or PATH.",
      };
    }

    const { stdout, stderr, code } = await context.runCommand(tool, [
      "--show-column-numbers",
      "--no-error-summary",
      ...files,
    ]);

    if (code === 0) {
      return { status: "pass", findings: [] };
    }

    const findings: CheckFinding[] = [];
    const lines = `${stdout}\n${stderr}`.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = MYPY_LINE_PATTERN.exec(trimmed);
      if (match && match[1] && match[2] && match[4]) {
        findings.push({
          file: match[1],
          line: parseInt(match[2], 10),
          message: match[4],
          rule: match[5] ?? "mypy",
        });
      }
    }

    return {
      status: findings.length > 0 || code !== 0 ? "fail" : "pass",
      findings,
    };
  },
};
