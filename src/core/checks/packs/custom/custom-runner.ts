import { access } from "node:fs/promises";
import { join } from "node:path";
import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
  PreFlightConfig,
  CustomCheckConfig,
} from "../../../../shared/types.js";
import { doesFileMatch } from "../../manual-evaluator.js";

// MARK: - Helpers

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function filterMatchingFiles(
  diff: GitDiff,
  config: CustomCheckConfig,
): string[] {
  return diff.changedFiles
    .filter((f) => f.status !== "deleted")
    .map((f) => f.path)
    .filter((path) => {
      let matched = true;
      if (config.fileExtensions && config.fileExtensions.length > 0) {
        matched = config.fileExtensions.some((ext) => path.endsWith(ext));
      }
      if (matched && config.filesMatch) {
        matched = doesFileMatch(path, config.filesMatch);
      }
      return matched;
    });
}

function parseOutputFindings(
  stdout: string,
  stderr: string,
  matchingFiles: string[],
  toolLabel: string,
): CheckFinding[] {
  const combined = `${stdout}\n${stderr}`;
  const findings: CheckFinding[] = [];

  for (const rawLine of combined.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = /^([^:\n]+):(\d+)(?::(\d+))?:\s*(.+)$/.exec(line);
    if (match) {
      const file = match[1]?.trim() ?? matchingFiles[0] ?? "(diff)";
      const lineNum = Number.parseInt(match[2] ?? "1", 10);
      const colNum = match[3] ? Number.parseInt(match[3], 10) : undefined;
      const message = match[4]?.trim() ?? line;

      findings.push({
        file,
        line: Number.isNaN(lineNum) || lineNum <= 0 ? 1 : lineNum,
        column: colNum && !Number.isNaN(colNum) ? colNum : undefined,
        message,
        rule: toolLabel,
      });
    }
  }

  if (findings.length === 0) {
    const fallbackMessage = (stderr || stdout).trim();
    findings.push({
      file: matchingFiles[0] ?? "(diff)",
      line: 1,
      message: fallbackMessage.slice(0, 300) || `${toolLabel} failed.`,
      rule: toolLabel,
    });
  }

  return findings;
}

// MARK: - Factory

export function createCustomCheckRunner(
  config: CustomCheckConfig,
  packId = "custom",
): CheckRunner {
  return {
    id: config.id,
    label: config.label,
    severity: config.severity ?? "error",
    pack: config.pack ?? packId,
    fixable: Boolean(config.fixArgs && config.fixArgs.length > 0),

    appliesTo(diff: GitDiff): boolean {
      return filterMatchingFiles(diff, config).length > 0;
    },

    async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
      const files = filterMatchingFiles(diff, config);
      const tool = await context.resolveTool(config.tool);

      if (!tool) {
        return {
          status: "not-configured",
          findings: [],
          message: `${config.tool} is not installed in local environment or PATH.`,
        };
      }

      const args = [...(config.args ?? [])];
      if (config.appendChangedFiles !== false) {
        args.push(...files);
      }

      const { stdout, stderr, code } = await context.runCommand(tool, args);

      if (code === 0) {
        return { status: "pass", findings: [] };
      }

      const findings = parseOutputFindings(stdout, stderr, files, config.label);
      return {
        status: "fail",
        findings,
        message: `${config.label} failed with exit code ${code}.`,
      };
    },
  };
}

// MARK: - Builder

export async function buildCustomChecks(
  config: PreFlightConfig,
  workspaceRoot: string,
): Promise<CheckRunner[]> {
  const runners: CheckRunner[] = [];

  for (const pack of config.customPacks ?? []) {
    let active = true;
    if (pack.ecosystemMarker) {
      const markerPath = join(workspaceRoot, pack.ecosystemMarker);
      const exists = await fileExists(markerPath);
      active = exists || config.enabledPacks.includes(pack.id);
    }

    if (active) {
      for (const check of pack.checks) {
        runners.push(createCustomCheckRunner(check, pack.id));
      }
    }
  }

  for (const check of config.customChecks ?? []) {
    runners.push(createCustomCheckRunner(check, "custom"));
  }

  return runners;
}
