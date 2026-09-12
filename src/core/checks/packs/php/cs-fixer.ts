import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Helpers

function changedPhpFiles(diff: GitDiff): string[] {
  return diff.changedFiles
    .filter((f) => f.status !== "deleted" && f.path.endsWith(".php"))
    .map((f) => f.path);
}

// MARK: - Check Definition

export const phpCsFixerCheck: CheckRunner = {
  id: "php:cs-fixer",
  label: "PHP-CS-Fixer",
  severity: "error",
  pack: "php",
  fixable: true,

  appliesTo(diff: GitDiff): boolean {
    return changedPhpFiles(diff).length > 0;
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const files = changedPhpFiles(diff);
    const tool = await context.resolveTool("php-cs-fixer");

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message: "php-cs-fixer is not installed in vendor/bin or PATH.",
      };
    }

    const args = ["fix", "--dry-run", "--format=json", "--diff", ...files];
    const { stdout, stderr, code } = await context.runCommand(tool, args);

    if (code === 0) {
      return { status: "pass", findings: [] };
    }

    const unformattedFiles: string[] = [];

    try {
      const parsed = JSON.parse(stdout) as {
        files?: Array<{ name?: string }>;
      };
      if (Array.isArray(parsed.files)) {
        for (const item of parsed.files) {
          if (item.name) {
            unformattedFiles.push(item.name);
          }
        }
      }
    } catch {
      const combined = `${stdout}\n${stderr}`;
      for (const line of combined.split("\n")) {
        const trimmed = line.trim();
        const match = /^\d+\)\s+(.+\.php)/.exec(trimmed);
        if (match?.[1]) {
          unformattedFiles.push(match[1].trim());
        }
      }
    }

    const targetFiles = unformattedFiles.length > 0 ? unformattedFiles : files;
    const findings: CheckFinding[] = targetFiles.map((file) => ({
      file,
      line: 1,
      message: "File needs PHP formatting (run Quick Fix: php-cs-fixer fix).",
      rule: "php-cs-fixer",
    }));

    return {
      status: "fail",
      findings,
      message: `${findings.length} PHP file${findings.length === 1 ? "" : "s"} require formatting.`,
    };
  },
};
