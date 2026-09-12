import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import { parseAddedLines } from "../../../diff/parse-patch.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const PATTERN = /console\.(log|warn|error|debug|info|trace|dir)\s*\(/g;

// MARK: - Check Definition

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
    const additions = parseAddedLines(
      diff.rawPatch,
      diff.changedFiles[0]?.path,
    );

    for (const item of additions) {
      PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = PATTERN.exec(item.content)) !== null) {
        findings.push({
          file: item.file,
          line: item.line,
          message: `Stray console.${match[1] ?? "log"}() detected.`,
          rule: "no-console-log",
        });
      }
    }

    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
