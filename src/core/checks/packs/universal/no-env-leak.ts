import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import { parseAddedLines } from "../../../diff/parse-patch.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const PATTERNS = [
  /AKIA[0-9A-Z]{16}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /(?:password|secret|token|api_key)\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
];

// MARK: - Check Definition

export const noEnvLeak: CheckRunner = {
  id: "universal:no-env-leak",
  label: "No secrets / env leak",
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
      for (const pattern of PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(item.content)) {
          findings.push({
            file: item.file,
            line: item.line,
            message: "Potential secret or environment variable leak detected.",
            rule: "no-env-leak",
          });
          break;
        }
      }
    }

    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
