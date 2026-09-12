import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type { GitDiff, CheckResult } from "../../../../shared/types.js";

const execFileAsync = promisify(execFile);

const JS_TS_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md)$/;

function changedJsTsFiles(diff: GitDiff): string[] {
  return diff.changedFiles
    .filter((f) => f.status !== "deleted" && JS_TS_EXTENSIONS.test(f.path))
    .map((f) => f.path);
}

export const prettierCheck: CheckRunner = {
  id: "js-ts:prettier",
  label: "Prettier",
  severity: "error",
  pack: "js-ts",

  appliesTo(diff: GitDiff): boolean {
    return changedJsTsFiles(diff).length > 0;
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const files = changedJsTsFiles(diff);

    try {
      await execFileAsync("prettier", ["--check", ...files], {
        cwd: context.workspaceRoot,
      });
      return { status: "pass", findings: [] };
    } catch (e) {
      const stderr = (e as { stderr?: string }).stderr ?? "";
      if ((e as { code?: number }).code === undefined) {
        return {
          status: "not-configured",
          findings: [],
          message: "prettier not found in PATH or local node_modules.",
        };
      }
      const unformatted = stderr
        .split("\n")
        .filter((l) => l.includes("[warn]"))
        .map((l) => l.replace("[warn]", "").trim());
      return {
        status: "fail",
        findings: unformatted.map((file) => ({
          file,
          line: 0,
          message: "File is not formatted by Prettier.",
          rule: "prettier",
        })),
      };
    }
  },
};
