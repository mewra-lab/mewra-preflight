import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

const SECRETS_PATTERN =
  /(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY|CLIENT_SECRET|JWT_SECRET)\s*[:=]\s*["'][^"']{4,}/i;

export const noEnvLeak: CheckRunner = {
  id: "universal:no-env-leak",
  label: "No credential leak",
  severity: "error",
  pack: "universal",

  appliesTo(_diff: GitDiff): boolean {
    return true;
  },

  async run(diff: GitDiff, _context: PreFlightContext): Promise<CheckResult> {
    const findings: CheckFinding[] = [];
    for (const line of diff.rawPatch.split("\n")) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      if (SECRETS_PATTERN.test(line)) {
        findings.push({
          file: "(diff)",
          line: 0,
          message:
            "Possible credential or secret literal detected in added lines.",
          rule: "no-env-leak",
        });
      }
    }
    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
