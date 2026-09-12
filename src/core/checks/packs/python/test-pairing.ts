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

function isTestFile(path: string): boolean {
  const filename = path.split("/").pop() ?? path;
  return (
    filename.startsWith("test_") ||
    filename.endsWith("_test.py") ||
    filename === "__init__.py" ||
    filename === "conftest.py" ||
    filename === "setup.py"
  );
}

function candidateTestPaths(sourcePath: string): string[] {
  const parts = sourcePath.split("/");
  const filename = parts.pop() ?? sourcePath;
  const dir = parts.join("/");
  const baseName = filename.replace(/\.py$/, "");

  const candidates: string[] = [];

  const prefixTest = dir ? `${dir}/test_${baseName}.py` : `test_${baseName}.py`;
  const suffixTest = dir ? `${dir}/${baseName}_test.py` : `${baseName}_test.py`;
  candidates.push(prefixTest, suffixTest);

  candidates.push(`tests/test_${baseName}.py`);
  candidates.push(`tests/${baseName}_test.py`);
  if (dir.startsWith("src/")) {
    const subDir = dir.slice(4);
    candidates.push(`tests/${subDir}/test_${baseName}.py`);
    candidates.push(`tests/${subDir}/${baseName}_test.py`);
  }

  return candidates;
}

// MARK: - Check Definition

export const pythonTestPairingCheck: CheckRunner = {
  id: "python:test-pairing",
  label: "Python Test Pairing",
  severity: "warning",
  pack: "python",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some(
      (f) =>
        f.status === "added" && f.path.endsWith(".py") && !isTestFile(f.path),
    );
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const findings: CheckFinding[] = [];
    const changedPaths = new Set(diff.changedFiles.map((f) => f.path));

    const addedSourceFiles = diff.changedFiles.filter(
      (f) =>
        f.status === "added" && f.path.endsWith(".py") && !isTestFile(f.path),
    );

    for (const file of addedSourceFiles) {
      const candidates = candidateTestPaths(file.path);
      const matchedInDiff = candidates.some((c) => changedPaths.has(c));
      if (matchedInDiff) {
        continue;
      }

      let matchedOnDisk = false;
      for (const candidate of candidates) {
        const fullPath = resolve(context.workspaceRoot, candidate);
        if (await fileExists(fullPath)) {
          matchedOnDisk = true;
          break;
        }
      }

      if (!matchedOnDisk) {
        findings.push({
          file: file.path,
          line: 0,
          message: `New Python module is missing matching test file (e.g. ${candidates[0]}).`,
          rule: "python-test-pairing",
        });
      }
    }

    return {
      status: findings.length > 0 ? "warning" : "pass",
      findings,
    };
  },
};
