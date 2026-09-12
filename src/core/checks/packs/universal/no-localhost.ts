import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
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
    for (const line of diff.rawPatch.split("\n")) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      let match: RegExpExecArray | null;
      LOCALHOST_PATTERN.lastIndex = 0;
      while ((match = LOCALHOST_PATTERN.exec(line)) !== null) {
        findings.push({
          file: "(diff)",
          line: 0,
          message: `Hardcoded localhost URL detected: ${match[0]}`,
          rule: "no-localhost-urls",
        });
      }
    }
    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
