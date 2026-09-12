import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Types

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

// MARK: - Helpers

function changedJsTs(diff: GitDiff): string[] {
  return diff.changedFiles
    .filter(
      (f) =>
        f.status !== "deleted" &&
        /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|astro)$/.test(f.path),
    )
    .map((f) => f.path);
}

// MARK: - Check Definition

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
    const tool = await context.resolveTool("eslint");

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message: "ESLint is not installed in local node_modules or PATH.",
      };
    }

    const { stdout, code } = await context.runCommand(tool, [
      "--format",
      "json",
      ...files,
    ]);

    if (code === 0) {
      return { status: "pass", findings: [] };
    }

    let results: ESLintResultItem[] = [];
    try {
      results = JSON.parse(stdout) as ESLintResultItem[];
    } catch {
      return {
        status: "fail",
        findings: [],
        message: "ESLint produced unparseable output.",
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
  },
};
