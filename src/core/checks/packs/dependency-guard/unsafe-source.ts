import type { CheckRunner } from "../../check-contract.js";
import type {
  CheckFinding,
  CheckResult,
  GitDiff,
} from "../../../../shared/types.js";
import { parseAddedLines } from "../../../diff/parse-patch.js";

// MARK: - Dependency Source Safety

const DEPENDENCY_FILES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "requirements.txt",
  "poetry.lock",
  "Pipfile.lock",
  "go.sum",
  "Cargo.lock",
  "composer.lock",
]);

function isDependencyFile(path: string): boolean {
  const fileName = path.split("/").pop() ?? path;
  return DEPENDENCY_FILES.has(fileName);
}

function isInsecureSource(line: string): boolean {
  return /(?:resolved|version|url|source)?[^\n]*\b(?:git\+)?http:\/\//i.test(
    line,
  );
}

export const dependencyUnsafeSourceCheck: CheckRunner = {
  id: "dependency-guard:unsafe-source",
  label: "Dependency Guard — Secure Sources",
  severity: "error",
  pack: "dependency-guard",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some((file) => isDependencyFile(file.path));
  },

  async run(diff: GitDiff): Promise<CheckResult> {
    const findings: CheckFinding[] = parseAddedLines(diff.rawPatch)
      .filter(
        (line) => isDependencyFile(line.file) && isInsecureSource(line.content),
      )
      .map((line) => ({
        file: line.file,
        line: line.line,
        message:
          "Dependency source uses insecure HTTP. Use HTTPS or a trusted registry.",
        rule: "dependency-guard:unsafe-source",
      }));

    if (findings.length > 0) {
      return {
        status: "fail",
        findings,
        message: `${findings.length} insecure dependency source${findings.length === 1 ? "" : "s"} found.`,
      };
    }

    return {
      status: "pass",
      findings: [],
      message:
        "Changed dependency sources use HTTPS or local package references.",
    };
  },
};
