import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import { parseAddedLines } from "../../../diff/parse-patch.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const CONFLICT_MARKER_PATTERN = /^(<{7}|={7}|>{7})/;

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
    const additions = parseAddedLines(
      diff.rawPatch,
      diff.changedFiles[0]?.path,
    );

    for (const item of additions) {
      if (CONFLICT_MARKER_PATTERN.test(item.content)) {
        findings.push({
          file: item.file,
          line: item.line,
          message: "Unresolved merge conflict marker detected.",
          rule: "no-merge-conflicts",
        });
      }
    }

    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
