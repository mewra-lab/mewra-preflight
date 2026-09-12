import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

const PATTERN = /console\.(log|warn|error|debug|info|trace|dir)\s*\(/g;

export const noConsoleLog: CheckRunner = {
  id: "universal:no-console-log",
  label: "No console.log",
  severity: "error",
  pack: "universal",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some(
      (f) =>
        f.status !== "deleted" && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f.path),
    );
  },

  async run(diff: GitDiff, _context: PreFlightContext): Promise<CheckResult> {
    const findings: CheckFinding[] = [];
    for (const line of diff.rawPatch.split("\n")) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      let match: RegExpExecArray | null;
      PATTERN.lastIndex = 0;
      while ((match = PATTERN.exec(line)) !== null) {
        findings.push({
          file: "(diff)",
          line: 0,
          message: `Stray console.${match[1] ?? "log"}() detected in diff.`,
          rule: "no-console-log",
        });
      }
    }
    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
