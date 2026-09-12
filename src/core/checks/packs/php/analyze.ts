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

function normalizePath(filePath: string, workspaceRoot: string): string {
  if (filePath.startsWith(workspaceRoot)) {
    const rel = filePath.slice(workspaceRoot.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return filePath;
}

// MARK: - Check Definition

export const phpAnalyzeCheck: CheckRunner = {
  id: "php:analyze",
  label: "PHPStan",
  severity: "error",
  pack: "php",

  appliesTo(diff: GitDiff): boolean {
    return changedPhpFiles(diff).length > 0;
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const files = changedPhpFiles(diff);
    const phpstanTool = await context.resolveTool("phpstan");
    const psalmTool = !phpstanTool ? await context.resolveTool("psalm") : null;
    const tool = phpstanTool ?? psalmTool;

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message:
          "Neither phpstan nor psalm is installed in vendor/bin or PATH.",
      };
    }

    const isPhpstan = Boolean(phpstanTool);
    const args = isPhpstan
      ? ["analyse", "--error-format=json", "--no-progress", ...files]
      : ["--output-format=json", ...files];

    const { stdout, stderr, code } = await context.runCommand(tool, args);

    if (code === 0) {
      return { status: "pass", findings: [] };
    }

    const findings: CheckFinding[] = [];

    if (isPhpstan) {
      try {
        const parsed = JSON.parse(stdout) as {
          files?: Record<
            string,
            { messages?: Array<{ message?: string; line?: number }> }
          >;
        };
        if (parsed.files) {
          for (const [absOrRelPath, fileObj] of Object.entries(parsed.files)) {
            const relPath = normalizePath(absOrRelPath, context.workspaceRoot);
            for (const msg of fileObj.messages ?? []) {
              if (msg.message) {
                findings.push({
                  file: relPath,
                  line: msg.line && msg.line > 0 ? msg.line : 1,
                  message: msg.message,
                  rule: "phpstan",
                });
              }
            }
          }
        }
      } catch {
        const fallbackMessage = (stderr || stdout).trim();
        findings.push({
          file: files[0] ?? "(diff)",
          line: 1,
          message: fallbackMessage.slice(0, 300) || "PHPStan analysis failed.",
          rule: "phpstan",
        });
      }
    } else {
      try {
        const parsed = JSON.parse(stdout) as Array<{
          file_path?: string;
          line_from?: number;
          message?: string;
        }>;
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.file_path && item.message) {
              findings.push({
                file: normalizePath(item.file_path, context.workspaceRoot),
                line: item.line_from && item.line_from > 0 ? item.line_from : 1,
                message: item.message,
                rule: "psalm",
              });
            }
          }
        }
      } catch {
        const fallbackMessage = (stderr || stdout).trim();
        findings.push({
          file: files[0] ?? "(diff)",
          line: 1,
          message: fallbackMessage.slice(0, 300) || "Psalm analysis failed.",
          rule: "psalm",
        });
      }
    }

    return {
      status: "fail",
      findings,
      message: `${findings.length} static analysis issue${findings.length === 1 ? "" : "s"} detected by ${isPhpstan ? "PHPStan" : "Psalm"}.`,
    };
  },
};
