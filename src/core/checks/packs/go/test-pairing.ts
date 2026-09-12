import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Helpers

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function candidateTestPath(sourcePath: string): string {
  return sourcePath.replace(/\.go$/, "_test.go");
}

// MARK: - Check Definition

export const goTestPairingCheck: CheckRunner = {
  id: "go:test-pairing",
  label: "Go Test Pairing",
  severity: "warning",
  pack: "go",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some(
      (f) =>
        f.status === "added" &&
        f.path.endsWith(".go") &&
        !f.path.endsWith("_test.go"),
    );
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const findings: CheckFinding[] = [];
    const changedPaths = new Set(diff.changedFiles.map((f) => f.path));

    const addedSourceFiles = diff.changedFiles.filter(
      (f) =>
        f.status === "added" &&
        f.path.endsWith(".go") &&
        !f.path.endsWith("_test.go"),
    );

    for (const file of addedSourceFiles) {
      const expectedTest = candidateTestPath(file.path);
      if (changedPaths.has(expectedTest)) {
        continue;
      }

      const fullExpectedPath = resolve(context.workspaceRoot, expectedTest);
      const existsOnDisk = await fileExists(fullExpectedPath);

      if (!existsOnDisk) {
        findings.push({
          file: file.path,
          line: 0,
          message: `New Go file is missing matching test file: ${expectedTest}`,
          rule: "go-test-pairing",
        });
      }
    }

    return {
      status: findings.length > 0 ? "warning" : "pass",
      findings,
    };
  },
};
