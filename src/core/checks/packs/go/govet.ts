import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const GO_LINE_PATTERN = /^([^:\s]+):(\d+):(?:\d+:)?\s*(.+)$/;

// MARK: - Helpers

function changedGoPackages(diff: GitDiff): string[] {
  const dirs = new Set<string>();
  for (const f of diff.changedFiles) {
    if (f.status !== "deleted" && f.path.endsWith(".go")) {
      const idx = f.path.lastIndexOf("/");
      const dir = idx !== -1 ? `./${f.path.slice(0, idx)}/...` : "./...";
      dirs.add(dir);
    }
  }
  return Array.from(dirs);
}

// MARK: - Check Definition

export const govetCheck: CheckRunner = {
  id: "go:govet",
  label: "go vet",
  severity: "error",
  pack: "go",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some(
      (f) => f.status !== "deleted" && f.path.endsWith(".go"),
    );
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const packages = changedGoPackages(diff);
    const tool = await context.resolveTool("go");

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message: "go executable is not found in PATH.",
      };
    }

    const { stderr, code } = await context.runCommand(tool, [
      "vet",
      ...(packages.length > 0 ? packages : ["./..."]),
    ]);

    if (code === 0) {
      return { status: "pass", findings: [] };
    }

    const findings: CheckFinding[] = [];
    const lines = stderr.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = GO_LINE_PATTERN.exec(trimmed);
      if (match && match[1] && match[2] && match[3]) {
        findings.push({
          file: match[1],
          line: parseInt(match[2], 10),
          message: match[3],
          rule: "go-vet",
        });
      }
    }

    return {
      status: findings.length > 0 || code !== 0 ? "fail" : "pass",
      findings,
    };
  },
};
