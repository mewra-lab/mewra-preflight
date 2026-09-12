import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Types

type RuffMessage = {
  code?: string;
  message?: string;
  filename?: string;
  location?: {
    row?: number;
    column?: number;
  };
};

// MARK: - Constants

const FLAKE8_LINE_PATTERN = /^([^:\s]+):(\d+):(?:\d+:)?\s*([A-Z0-9]+)\s*(.+)$/;

// MARK: - Helpers

function changedPythonFiles(diff: GitDiff): string[] {
  return diff.changedFiles
    .filter((f) => f.status !== "deleted" && f.path.endsWith(".py"))
    .map((f) => f.path);
}

// MARK: - Check Definition

export const pythonLintCheck: CheckRunner = {
  id: "python:lint",
  label: "Python Lint",
  severity: "error",
  pack: "python",

  appliesTo(diff: GitDiff): boolean {
    return changedPythonFiles(diff).length > 0;
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const files = changedPythonFiles(diff);
    const ruffTool = await context.resolveTool("ruff");
    const flake8Tool = !ruffTool ? await context.resolveTool("flake8") : null;
    const tool = ruffTool ?? flake8Tool;

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message:
          "Neither ruff nor flake8 is installed in local venv (.venv), uv, or PATH.",
      };
    }

    const isRuff = Boolean(ruffTool);
    const args = isRuff ? ["check", "--output-format=json", ...files] : files;

    const { stdout, stderr, code } = await context.runCommand(tool, args);

    if (code === 0) {
      return { status: "pass", findings: [] };
    }

    const findings: CheckFinding[] = [];

    if (isRuff) {
      try {
        const parsed = JSON.parse(stdout) as RuffMessage[];
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.filename && item.message) {
              findings.push({
                file: item.filename,
                line: item.location?.row ?? 0,
                message: item.message,
                rule: item.code ?? "ruff",
              });
            }
          }
        }
      } catch {}
    } else {
      const outputLines = `${stdout}\n${stderr}`.split("\n");
      for (const line of outputLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const match = FLAKE8_LINE_PATTERN.exec(trimmed);
        if (match && match[1] && match[2] && match[3] && match[4]) {
          findings.push({
            file: match[1],
            line: parseInt(match[2], 10),
            message: match[4],
            rule: match[3],
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
