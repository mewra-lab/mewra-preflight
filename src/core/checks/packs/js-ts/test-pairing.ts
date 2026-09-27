import { access } from "node:fs/promises";
import { resolve, extname } from "node:path";
import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const SOURCE_RE =
  /^(?:src\/|(?:apps|packages)\/[^/]+\/src\/).+\.(ts|tsx|js|jsx|vue|svelte)$/;
const EXCLUDE_RE =
  /(\.d\.ts|\.(?:test|spec)\.(?:ts|tsx|js|jsx)|(?:^|\/)index\.(ts|tsx|js|jsx))$/;

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
      const stem = source.path.slice(0, -ext.length);
      const sourceRoot = /^(.*?)(?:src\/)/.exec(stem)?.[1] ?? "";
      const moduleStem = stem.slice(sourceRoot.length).replace(/^src\//, "");
      const stems = [
        stem,
        `${sourceRoot}tests/${moduleStem}`,
        `${sourceRoot}tests/unit/${moduleStem}`,
      ];
      const candidates = stems.flatMap((base) =>
        ["ts", "tsx", "js", "jsx"].flatMap((extension) =>
          ["test", "spec"].map((kind) => `${base}.${kind}.${extension}`),
        ),
      );
      const matchedInDiff = candidates.some(
        (path) =>
          diffPaths.has(path) &&
          !diff.changedFiles.some(
            (file) => file.path === path && file.status === "deleted",
          ),
      );

      if (matchedInDiff) {
        continue;
      }

      let foundOnDisk = false;
      const diskCandidates = candidates
        .filter(
          (path) =>
            !diff.changedFiles.some(
              (file) => file.path === path && file.status === "deleted",
            ),
        )
        .map((path) => resolve(context.workspaceRoot, path));

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
