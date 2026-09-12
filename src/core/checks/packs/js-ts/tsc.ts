import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const TSC_LINE_RE = /^(.+)\((\d+),(\d+)\):\s+(?:error|warning)\s+\w+:\s+(.+)$/;

// MARK: - Check Definition

export const tscCheck: CheckRunner = {
  id: "js-ts:tsc",
  label: "TypeScript",
  severity: "error",
  pack: "js-ts",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some(
      (f) => f.status !== "deleted" && /\.(tsx?|vue)$/.test(f.path),
    );
  },

  async run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult> {
    const hasVue = diff.changedFiles.some((f) => f.path.endsWith(".vue"));
    const tool =
      (hasVue ? await context.resolveTool("vue-tsc") : null) ??
      (await context.resolveTool("tsc"));

    if (!tool) {
      return {
        status: "not-configured",
        findings: [],
        message:
          "TypeScript compiler (tsc or vue-tsc) is not installed in local node_modules or PATH.",
      };
    }

    const { stdout, code } = await context.runCommand(tool, [
      "--noEmit",
      "--pretty",
      "false",
    ]);

    if (code === 0) {
      return { status: "pass", findings: [] };
    }

    const changedPaths = new Set(
      diff.changedFiles.map((f) => f.path.replace(/\\/g, "/")),
    );

    const findings: CheckFinding[] = stdout.split("\n").flatMap((line) => {
      const match = TSC_LINE_RE.exec(line);
      if (!match) return [];
      const [, rawFile, rawLine, rawCol, message] = match;
      if (!rawFile || !rawLine || !rawCol || !message) return [];
      const normalizedFile = rawFile.replace(/\\/g, "/");

      const isChanged = Array.from(changedPaths).some((p) =>
        normalizedFile.endsWith(p),
      );
      if (!isChanged) return [];

      return [
        {
          file: rawFile,
          line: parseInt(rawLine, 10),
          column: parseInt(rawCol, 10),
          message,
          rule: "tsc",
        },
      ];
    });

    return { status: findings.length > 0 ? "fail" : "pass", findings };
  },
};
