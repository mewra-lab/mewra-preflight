import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import { parseAddedLines } from "../../../diff/parse-patch.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const PATTERN = /\bdebugger\s*;?/g;

// MARK: - Check Definition

export const noDebugger: CheckRunner = {
  id: "universal:no-debugger",
  label: "No debugger",
  severity: "error",
  pack: "universal",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some(
      (f) =>
        f.status !== "deleted" &&
        /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|astro)$/.test(f.path),
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
      if (PATTERN.test(item.content)) {
        findings.push({
          file: item.file,
          line: item.line,
          message: "Stray debugger statement detected.",
          rule: "no-debugger",
        });
      }
    }

    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
