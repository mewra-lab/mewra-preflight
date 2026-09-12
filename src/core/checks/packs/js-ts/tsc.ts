import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

const execFileAsync = promisify(execFile);

const TSC_LINE_RE = /^(.+)\((\d+),(\d+)\):\s+(?:error|warning)\s+\w+:\s+(.+)$/;

export const tscCheck: CheckRunner = {
  id: "js-ts:tsc",
  label: "TypeScript",
  severity: "error",
  pack: "js-ts",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some(
      (f) => f.status !== "deleted" && /\.tsx?$/.test(f.path),
    );
  },

  async run(_diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    try {
      await execFileAsync("tsc", ["--noEmit", "--pretty", "false"], {
        cwd: context.workspaceRoot,
      });
      return { status: "pass", findings: [] };
    } catch (e) {
      const stdout = (e as { stdout?: string }).stdout ?? "";

      if ((e as { code?: unknown }).code === "ENOENT") {
        return {
          status: "not-configured",
          findings: [],
          message: "tsc not found in PATH or local node_modules.",
        };
      }

      const findings: CheckFinding[] = stdout.split("\n").flatMap((line) => {
        const match = TSC_LINE_RE.exec(line);
        if (!match) return [];
        const [, file, rawLine, rawCol, message] = match;
        if (!file || !rawLine || !rawCol || !message) return [];
        return [
          {
            file,
            line: parseInt(rawLine, 10),
            column: parseInt(rawCol, 10),
            message,
            rule: "tsc",
          },
        ];
      });

      return { status: findings.length > 0 ? "fail" : "pass", findings };
    }
  },
};
