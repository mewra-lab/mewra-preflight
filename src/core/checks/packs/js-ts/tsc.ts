import { access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { CheckRunner, PreFlightContext } from "../../check-contract.js";
import type {
  GitDiff,
  CheckResult,
  CheckFinding,
} from "../../../../shared/types.js";

// MARK: - Constants

const TSC_LINE_RE = /^(.+)\((\d+),(\d+)\):\s+(?:error|warning)\s+\w+:\s+(.+)$/;

// MARK: - Helpers

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findTsconfigs(
  workspaceRoot: string,
  changedFiles: string[],
): Promise<string[]> {
  const configs = new Set<string>();

  for (const file of changedFiles) {
    let currentDir = resolve(workspaceRoot, dirname(file));
    while (currentDir.startsWith(workspaceRoot)) {
      const candidate = resolve(currentDir, "tsconfig.json");
      if (await fileExists(candidate)) {
        configs.add(candidate);
        break;
      }
      if (currentDir === workspaceRoot) break;
      currentDir = dirname(currentDir);
    }
  }

  if (configs.size === 0) {
    const rootConfig = resolve(workspaceRoot, "tsconfig.json");
    if (await fileExists(rootConfig)) {
      configs.add(rootConfig);
    }
  }

  return Array.from(configs);
}

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

    const tsFiles = diff.changedFiles
      .filter((f) => f.status !== "deleted" && /\.(tsx?|vue)$/.test(f.path))
      .map((f) => f.path);

    const tsconfigs = await findTsconfigs(context.workspaceRoot, tsFiles);
    const runs =
      tsconfigs.length > 0
        ? tsconfigs.map((cfg) => ["--noEmit", "--pretty", "false", "-p", cfg])
        : [["--noEmit", "--pretty", "false"]];

    let combinedStdout = "";
    let anyFailed = false;

    for (const args of runs) {
      const { stdout, code } = await context.runCommand(tool, args);
      combinedStdout += `\n${stdout}`;
      if (code !== 0) anyFailed = true;
    }

    if (!anyFailed) {
      return { status: "pass", findings: [] };
    }

    const changedPaths = new Set(
      diff.changedFiles.map((f) => f.path.replace(/\\/g, "/")),
    );

    const findings: CheckFinding[] = combinedStdout
      .split("\n")
      .flatMap((line) => {
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
