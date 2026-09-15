import type { CheckRunner } from "../../check-contract.js";
import type {
  CheckFinding,
  CheckResult,
  GitDiff,
} from "../../../../shared/types.js";
import { parseAddedLines } from "../../../diff/parse-patch.js";

// MARK: - Destructive Migration

const MIGRATION_FILE =
  /(?:^|\/)(?:migrations?|prisma\/migrations)\/.*\.(?:sql|prisma)$/i;
const DESTRUCTIVE_SQL = /\bDROP\s+(?:TABLE|COLUMN|DATABASE|SCHEMA)\b/i;

export const ormDestructiveMigrationCheck: CheckRunner = {
  id: "orm-cost-sentry:destructive-migration",
  label: "ORM Cost Sentry — Destructive Migration",
  severity: "warning",
  pack: "orm-cost-sentry",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some((file) => MIGRATION_FILE.test(file.path));
  },

  async run(diff: GitDiff): Promise<CheckResult> {
    const findings: CheckFinding[] = parseAddedLines(diff.rawPatch)
      .filter(
        (line) =>
          MIGRATION_FILE.test(line.file) && DESTRUCTIVE_SQL.test(line.content),
      )
      .map((line) => ({
        file: line.file,
        line: line.line,
        message:
          "Destructive migration detected. Confirm backup, rollout, and rollback plans before shipping.",
        rule: "orm-cost-sentry:destructive-migration",
      }));

    return findings.length > 0
      ? {
          status: "warning",
          findings,
          message: `${findings.length} destructive migration statement${findings.length === 1 ? "" : "s"} found.`,
        }
      : {
          status: "pass",
          findings: [],
          message:
            "No destructive migration statements found in changed files.",
        };
  },
};
