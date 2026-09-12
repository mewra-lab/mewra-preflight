import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

const execFileAsync = promisify(execFile);

type ESLintResultItem = {
  filePath: string;
  messages: Array<{
    ruleId: string | null;
    severity: number;
    message: string;
    line: number;
    column: number;
  }>;
};

function changedJsTs(diff: GitDiff): string[] {
  return diff.changedFiles
    .filter(
      (f) =>
        f.status !== "deleted" && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f.path),
    )
    .map((f) => f.path);
}

export const eslintCheck: CheckRunner = {
  id: "js-ts:eslint",
  label: "ESLint",
  severity: "error",
  pack: "js-ts",

  appliesTo(diff: GitDiff): boolean {
    return changedJsTs(diff).length > 0;
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const files = changedJsTs(diff);

    try {
      await execFileAsync("eslint", ["--format", "json", ...files], {
        cwd: context.workspaceRoot,
      });
      return { status: "pass", findings: [] };
    } catch (e) {
      const stdout = (e as { stdout?: string }).stdout ?? "";

      if ((e as { code?: unknown }).code === "ENOENT" || stdout === "") {
        return {
          status: "not-configured",
          findings: [],
          message: "eslint not found in PATH or local node_modules.",
        };
      }

      let results: ESLintResultItem[] = [];
      try {
        results = JSON.parse(stdout) as ESLintResultItem[];
      } catch {
        return {
          status: "fail",
          findings: [],
          message: "eslint produced unparseable output.",
        };
      }

      const findings: CheckFinding[] = results.flatMap((r) =>
        r.messages
          .filter((m) => m.severity >= 2)
          .map((m) => ({
            file: r.filePath,
            line: m.line,
            column: m.column,
            message: m.message,
            rule: m.ruleId ?? undefined,
          })),
      );

      return { status: findings.length > 0 ? "fail" : "pass", findings };
    }
  },
};
