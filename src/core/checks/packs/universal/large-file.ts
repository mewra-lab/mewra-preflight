import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const ALLOWED_EXTENSIONS =
  /\.(png|jpg|jpeg|gif|webp|svg|woff|woff2|ttf|eot|ico)$/i;

// MARK: - Check Definition

export function createLargeFileWarning(thresholdMb = 1): CheckRunner {
  const thresholdBytes = thresholdMb * 1024 * 1024;

  return {
    id: "universal:large-file-warning",
    label: "Large File Warning",
    severity: "warning",
    pack: "universal",

    appliesTo(diff: GitDiff): boolean {
      return diff.changedFiles.some((f) => f.status === "added");
    },

    async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
      const findings: CheckFinding[] = [];
      const addedFiles = diff.changedFiles.filter(
        (f) => f.status === "added" && !ALLOWED_EXTENSIONS.test(f.path),
      );

      for (const file of addedFiles) {
        try {
          const fullPath = resolve(context.workspaceRoot, file.path);
          const fileStat = await stat(fullPath);
          if (fileStat.size > thresholdBytes) {
            findings.push({
              file: file.path,
              line: 0,
              message: `File exceeds ${thresholdMb}MB threshold (${(fileStat.size / (1024 * 1024)).toFixed(2)}MB).`,
              rule: "large-file-warning",
            });
          }
        } catch {
          continue;
        }
      }

      return {
        status: findings.length > 0 ? "warning" : "pass",
        findings,
      };
    },
  };
}

export const largeFileWarning: CheckRunner = createLargeFileWarning(1);
