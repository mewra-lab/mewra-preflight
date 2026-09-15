import type { CheckRunner } from "../../check-contract.js";
import type {
  CheckFinding,
  CheckResult,
  GitDiff,
} from "../../../../shared/types.js";
import { parseAddedLines } from "../../../diff/parse-patch.js";

// MARK: - Query In Loop

const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|php|rb|java|kt)$/;
const LOOP = /\b(?:for|while|foreach)\b|\.map\s*\(|\.forEach\s*\(/;
const QUERY =
  /\b(?:prisma|db|database|repository|entityManager|model)\b[\s\S]{0,80}\b(?:find(?:Many|First|Unique)?|select|query|execute|save|update|delete|create)\s*\(/i;

export const ormQueryInLoopCheck: CheckRunner = {
  id: "orm-cost-sentry:query-in-loop",
  label: "ORM Cost Sentry — Query in Loop",
  severity: "warning",
  pack: "orm-cost-sentry",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some((file) => SOURCE_FILE.test(file.path));
  },

  async run(diff: GitDiff): Promise<CheckResult> {
    const recentLoops = new Map<string, number>();
    const findings: CheckFinding[] = [];

    for (const line of parseAddedLines(diff.rawPatch)) {
      if (!SOURCE_FILE.test(line.file)) continue;

      const loopLine = recentLoops.get(line.file);
      if (loopLine !== undefined && line.line - loopLine > 12) {
        recentLoops.delete(line.file);
      }
      if (LOOP.test(line.content)) {
        recentLoops.set(line.file, line.line);
      }
      if (recentLoops.has(line.file) && QUERY.test(line.content)) {
        findings.push({
          file: line.file,
          line: line.line,
          message:
            "Potential per-item database query inside a loop. Consider batching or eager loading.",
          rule: "orm-cost-sentry:query-in-loop",
        });
      }
    }

    return findings.length > 0
      ? {
          status: "warning",
          findings,
          message: `${findings.length} potential query-in-loop pattern${findings.length === 1 ? "" : "s"} found.`,
        }
      : {
          status: "pass",
          findings: [],
          message: "No query-in-loop pattern found in changed source lines.",
        };
  },
};
