import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import { parseAddedLines } from "../../../diff/parse-patch.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const LOCALHOST_PATTERN = /https?:\/\/localhost(:[0-9]+)?/g;

// MARK: - Check Definition

export const noLocalhostUrls: CheckRunner = {
  id: "universal:no-localhost-urls",
  label: "No Localhost URLs",
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
      LOCALHOST_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = LOCALHOST_PATTERN.exec(item.content)) !== null) {
        findings.push({
          file: item.file,
          line: item.line,
          message: `Hardcoded localhost URL detected: ${match[0]}`,
          rule: "no-localhost-urls",
        });
      }
    }

    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
