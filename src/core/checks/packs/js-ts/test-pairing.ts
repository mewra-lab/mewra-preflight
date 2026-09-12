import { access } from "node:fs/promises";
import { resolve, basename, extname } from "node:path";
import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const SOURCE_RE = /^src\/.+\.(ts|tsx|js|jsx|vue|svelte)$/;
const EXCLUDE_RE = /(\.d\.ts|\.test\.|\.spec\.|index\.(ts|tsx|js|jsx))$/;

// MARK: - Helpers

async function existsOnDisk(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// MARK: - Check Definition

export const testPairingCheck: CheckRunner = {
  id: "js-ts:test-pairing",
  label: "Test Pairing",
  severity: "warning",
  pack: "js-ts",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some(
      (f) =>
        f.status === "added" &&
        SOURCE_RE.test(f.path) &&
        !EXCLUDE_RE.test(f.path),
    );
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const findings: CheckFinding[] = [];
    const addedSourceFiles = diff.changedFiles.filter(
      (f) =>
        f.status === "added" &&
        SOURCE_RE.test(f.path) &&
        !EXCLUDE_RE.test(f.path),
    );

    const diffPaths = new Set(diff.changedFiles.map((f) => f.path));

    for (const source of addedSourceFiles) {
      const ext = extname(source.path);
      const base = basename(source.path, ext);
      const testNames = [
        `${base}.test.ts`,
        `${base}.test.tsx`,
        `${base}.spec.ts`,
        `${base}.spec.tsx`,
        `${base}.test.js`,
        `${base}.spec.js`,
      ];

      const matchedInDiff = Array.from(diffPaths).some((p) =>
        testNames.some((t) => p.endsWith(t)),
      );

      if (matchedInDiff) {
        continue;
      }

      let foundOnDisk = false;
      const diskCandidates = [
        resolve(context.workspaceRoot, "tests", "unit", `${base}.test.ts`),
        resolve(context.workspaceRoot, "tests", "unit", `${base}.spec.ts`),
        resolve(context.workspaceRoot, "tests", `${base}.test.ts`),
        resolve(context.workspaceRoot, "tests", `${base}.spec.ts`),
        resolve(context.workspaceRoot, source.path.replace(ext, `.test${ext}`)),
      ];

      for (const cand of diskCandidates) {
        if (await existsOnDisk(cand)) {
          foundOnDisk = true;
          break;
        }
      }

      if (!foundOnDisk) {
        findings.push({
          file: source.path,
          line: 0,
          message: `No corresponding test file found for new source file: ${source.path}`,
          rule: "test-pairing",
        });
      }
    }

    return {
      status: findings.length > 0 ? "warning" : "pass",
      findings,
    };
  },
};
