import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Helpers

function changedPythonFiles(diff: GitDiff): string[] {
  return diff.changedFiles
    .filter((f) => f.status !== "deleted" && f.path.endsWith(".py"))
    .map((f) => f.path);
}

// MARK: - Check Definition

export const pythonFormatCheck: CheckRunner = {
  id: "python:format",
  label: "Python Format",
  severity: "error",
  pack: "python",

  appliesTo(diff: GitDiff): boolean {
    return changedPythonFiles(diff).length > 0;
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const files = changedPythonFiles(diff);
    const ruffTool = await context.resolveTool("ruff");
    const blackTool = !ruffTool ? await context.resolveTool("black") : null;
    const tool = ruffTool ?? blackTool;

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message:
          "Neither ruff nor black is installed in local venv (.venv), uv, or PATH.",
      };
    }

    const isRuff = Boolean(ruffTool);
    const args = isRuff
      ? ["format", "--check", ...files]
      : ["--check", ...files];

    const { stdout, stderr, code } = await context.runCommand(tool, args);

    if (code === 0) {
      return { status: "pass", findings: [] };
    }

    const combinedOutput = `${stdout}\n${stderr}`;
    const unformattedFiles: string[] = [];

    if (isRuff) {
      for (const line of combinedOutput.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("Would reformat:")) {
          const file = trimmed.replace("Would reformat:", "").trim();
          if (file) unformattedFiles.push(file);
        }
      }
    } else {
      for (const line of combinedOutput.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("would reformat ")) {
          const file = trimmed.replace("would reformat ", "").trim();
          if (file) unformattedFiles.push(file);
        }
      }
    }

    const targetFiles = unformattedFiles.length > 0 ? unformattedFiles : files;

    const findings: CheckFinding[] = targetFiles.map((file) => ({
      file,
      line: 0,
      message: `File is not formatted with ${isRuff ? "ruff format" : "black"}.`,
      rule: isRuff ? "ruff-format" : "black",
    }));

    return {
      status: findings.length > 0 ? "fail" : "pass",
      findings,
    };
  },
};
