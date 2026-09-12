import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type { GitDiff, CheckResult } from "../../../../shared/types.js";

// MARK: - Constants

const JS_TS_EXTENSIONS =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|less|html|vue|svelte|astro|md)$/;

// MARK: - Helpers

function changedJsTsFiles(diff: GitDiff): string[] {
  return diff.changedFiles
    .filter((f) => f.status !== "deleted" && JS_TS_EXTENSIONS.test(f.path))
    .map((f) => f.path);
}

// MARK: - Check Definition

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
    const tool = await context.resolveTool("prettier");

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message: "Prettier is not installed in local node_modules or PATH.",
      };
    }

    const { stdout, stderr, code } = await context.runCommand(tool, [
      "--check",
      ...files,
    ]);

    if (code === 0) {
      return { status: "pass", findings: [] };
    }

    const combinedOutput = `${stdout}\n${stderr}`;
    const fileSet = new Set(files.map((f) => f.replace(/\\/g, "/")));

    const unformatted = combinedOutput
      .split("\n")
      .filter((l) => l.includes("[warn]"))
      .map((l) => l.replace("[warn]", "").trim())
      .filter(
        (l) =>
          l.length > 0 &&
          !l.includes("Code style issues found") &&
          Array.from(fileSet).some((f) => l.endsWith(f) || f.endsWith(l)),
      );

    const matchedFiles =
      unformatted.length > 0
        ? unformatted
        : files.filter((f) => {
            const norm = f.replace(/\\/g, "/");
            const base = norm.split("/").pop() ?? "";
            return (
              combinedOutput.includes(norm) ||
              (base.length > 0 && combinedOutput.includes(base))
            );
          });

    const finalFiles = matchedFiles.length > 0 ? matchedFiles : files;

    return {
      status: "fail",
      findings: finalFiles.map((file) => ({
        file,
        line: 1,
        message: "File is not formatted by Prettier.",
        rule: "prettier",
      })),
    };
  },
};
