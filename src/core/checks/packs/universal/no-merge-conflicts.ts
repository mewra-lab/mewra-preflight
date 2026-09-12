import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const CONFLICT_MARKER_PATTERN = /^(\+{1})(<{7}|={7}|>{7})/;

// MARK: - Check Definition

export const noMergeConflicts: CheckRunner = {
  id: "universal:no-merge-conflicts",
  label: "No Merge Conflicts",
  severity: "error",
  pack: "universal",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some((f) => f.status !== "deleted");
  },

  async run(diff: GitDiff, _context: PreFlightContext): Promise<CheckResult> {
    const findings: CheckFinding[] = [];
    for (const line of diff.rawPatch.split("\n")) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      if (CONFLICT_MARKER_PATTERN.test(line)) {
        findings.push({
          file: "(diff)",
          line: 0,
          message: "Unresolved merge conflict marker detected in diff.",
          rule: "no-merge-conflicts",
        });
      }
    }
    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
