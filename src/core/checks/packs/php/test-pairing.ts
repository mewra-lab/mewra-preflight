import { access } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
  ChangedFile,
} from "../../../../shared/types.js";

// MARK: - Helpers

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith("test.php") ||
    lower.includes("/tests/") ||
    lower.includes("/test/") ||
    lower.startsWith("tests/") ||
    lower.startsWith("test/")
  );
}

function isIgnoredPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes("/migrations/") ||
    lower.startsWith("database/migrations/") ||
    lower.includes("/config/") ||
    lower.startsWith("config/") ||
    lower.includes("/database/seeders/") ||
    lower.includes("/database/factories/") ||
    lower.endsWith(".blade.php")
  );
}

function getExpectedTestPaths(relPath: string): string[] {
  const base = basename(relPath, ".php");
  const dir = dirname(relPath);
  const strippedDir = dir.replace(/^(src|app)\/?/, "");

  return [
    join("tests", `${base}Test.php`),
    join("tests", "Unit", `${base}Test.php`),
    join("tests", "Feature", `${base}Test.php`),
    join("tests", dir, `${base}Test.php`),
    join("tests", strippedDir, `${base}Test.php`),
    join("tests", "Unit", strippedDir, `${base}Test.php`),
    join("tests", "Feature", strippedDir, `${base}Test.php`),
    join(dir, `${base}Test.php`),
  ];
}

// MARK: - Check Definition

export const phpTestPairingCheck: CheckRunner = {
  id: "php:test-pairing",
  label: "PHP Test Pairing",
  severity: "warning",
  pack: "php",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some(
      (f: ChangedFile) =>
        f.status === "added" &&
        f.path.endsWith(".php") &&
        !isTestFile(f.path) &&
        !isIgnoredPath(f.path),
    );
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const candidates = diff.changedFiles.filter(
      (f: ChangedFile) =>
        f.status === "added" &&
        f.path.endsWith(".php") &&
        !isTestFile(f.path) &&
        !isIgnoredPath(f.path),
    );

    if (candidates.length === 0) {
      return { status: "pass", findings: [] };
    }

    const findings: CheckFinding[] = [];

    for (const f of candidates) {
      const expectedPaths = getExpectedTestPaths(f.path);
      let found = false;

      for (const expected of expectedPaths) {
        const fullExpected = join(context.workspaceRoot, expected);
        if (await fileExists(fullExpected)) {
          found = true;
          break;
        }
      }

      if (!found) {
        const baseName = basename(f.path, ".php");
        findings.push({
          file: f.path,
          line: 1,
          message: `New PHP file '${f.path}' has no matching test file (expected ${baseName}Test.php under tests/).`,
          rule: "test-pairing",
        });
      }
    }

    if (findings.length > 0) {
      return {
        status: "warning",
        findings,
        message: `${findings.length} new PHP file${findings.length === 1 ? "" : "s"} missing matching tests.`,
      };
    }

    return { status: "pass", findings: [] };
  },
};
