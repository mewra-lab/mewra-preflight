import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitDiff, ChangedFile } from "../../shared/types.js";

const execFileAsync = promisify(execFile);

type ExecError = { code?: number; stderr?: string };

function isExecError(e: unknown): e is ExecError {
  return typeof e === "object" && e !== null && "code" in e;
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", [...args], { cwd });
    return stdout.trim();
  } catch (e) {
    if (isExecError(e) && e.code !== undefined) {
      throw new Error(
        `git ${args[0]} exited with code ${e.code}: ${(e as { stderr?: string }).stderr ?? ""}`,
      );
    }
    throw e;
  }
}

async function resolveCurrentBranch(cwd: string): Promise<string> {
  return runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

function parseNameStatus(raw: string): ChangedFile[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const status = parts[0] ?? "";
      const path = parts[1] ?? "";
      const oldPath = parts[2];

      if (status.startsWith("R")) {
        return {
          path,
          status: "renamed" as const,
          oldPath: oldPath ?? parts[1],
        };
      }
      const statusMap: Record<string, ChangedFile["status"]> = {
        A: "added",
        M: "modified",
        D: "deleted",
      };
      return {
        path,
        status: statusMap[status[0] ?? ""] ?? "modified",
      };
    });
}

export async function computeGitDiff(
  workspaceRoot: string,
  baseBranch: string,
): Promise<GitDiff> {
  const headBranch = await resolveCurrentBranch(workspaceRoot);

  const [nameStatus, rawPatch] = await Promise.all([
    runGit(workspaceRoot, ["diff", "--name-status", `${baseBranch}...HEAD`]),
    runGit(workspaceRoot, ["diff", `${baseBranch}...HEAD`]),
  ]);

  return {
    baseBranch,
    headBranch,
    changedFiles: parseNameStatus(nameStatus),
    rawPatch,
  };
}
