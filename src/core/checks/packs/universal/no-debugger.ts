import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

export const noDebugger: CheckRunner = {
  id: "universal:no-debugger",
  label: "No debugger",
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
      if (/\bdebugger\b/.test(line)) {
        findings.push({
          file: "(diff)",
          line: 0,
          message: "Stray debugger statement detected in diff.",
          rule: "no-debugger",
        });
      }
    }
    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
