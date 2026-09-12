import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { GitDiff, ChangedFile, DiffScope } from "../../shared/types.js";

// MARK: - Types

type ExecError = { code?: number; stderr?: string };

// MARK: - Helpers

const execFileAsync = promisify(execFile);

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
  try {
    const branch = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return branch || "HEAD";
  } catch {
    return "HEAD";
  }
}

async function resolveBaseRef(
  cwd: string,
  baseBranch: string,
): Promise<string> {
  const candidates = [
    baseBranch,
    `origin/${baseBranch}`,
    baseBranch === "main" ? "master" : "main",
    baseBranch === "main" ? "origin/master" : "origin/main",
  ];

  for (const c of candidates) {
    try {
      await runGit(cwd, ["rev-parse", "--verify", c]);
      return c;
    } catch {
      continue;
    }
  }

  return "HEAD";
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

async function getUntrackedFiles(cwd: string): Promise<string[]> {
  try {
    const raw = await runGit(cwd, ["status", "--porcelain"]);
    return raw
      .split("\n")
      .filter((line) => line.startsWith("?? "))
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function synthesizeUntrackedPatch(
  cwd: string,
  files: string[],
): Promise<string> {
  const patches: string[] = [];

  for (const file of files) {
    try {
      const fullPath = resolve(cwd, file);
      const s = await stat(fullPath);
      if (s.isDirectory() || s.size > 1024 * 1024) continue;

      const content = await readFile(fullPath, "utf8");
      const lines = content.split("\n");
      const patchLines = [
        `diff --git a/${file} b/${file}`,
        "new file mode 100644",
        "--- /dev/null",
        `+++ b/${file}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((l) => `+${l}`),
      ];
      patches.push(patchLines.join("\n"));
    } catch {
      continue;
    }
  }

  return patches.join("\n\n");
}

// MARK: - Diff Computation

export async function computeGitDiff(
  workspaceRoot: string,
  baseBranch: string,
  scope: DiffScope = "branch",
): Promise<GitDiff> {
  const headBranch = await resolveCurrentBranch(workspaceRoot);
  const resolvedBase = await resolveBaseRef(workspaceRoot, baseBranch);

  let nameStatus = "";
  let rawPatch = "";

  if (scope === "staged") {
    [nameStatus, rawPatch] = await Promise.all([
      runGit(workspaceRoot, ["diff", "--cached", "--name-status"]),
      runGit(workspaceRoot, ["diff", "--cached"]),
    ]);

    return {
      baseBranch: resolvedBase,
      headBranch,
      changedFiles: parseNameStatus(nameStatus),
      rawPatch,
      scope: "staged",
    };
  }

  if (scope === "working") {
    [nameStatus, rawPatch] = await Promise.all([
      runGit(workspaceRoot, ["diff", "--name-status", "HEAD"]),
      runGit(workspaceRoot, ["diff", "HEAD"]),
    ]);

    if (!nameStatus) {
      try {
        await runGit(workspaceRoot, ["rev-parse", "--verify", "HEAD~1"]);
        [nameStatus, rawPatch] = await Promise.all([
          runGit(workspaceRoot, ["diff", "--name-status", "HEAD~1..HEAD"]),
          runGit(workspaceRoot, ["diff", "HEAD~1..HEAD"]),
        ]);
      } catch {}
    }

    const changedFiles = parseNameStatus(nameStatus);
    const existingPaths = new Set(changedFiles.map((f) => f.path));

    const untracked = await getUntrackedFiles(workspaceRoot);
    const newUntracked = untracked.filter((u) => !existingPaths.has(u));

    for (const u of newUntracked) {
      changedFiles.push({ path: u, status: "added" });
    }

    if (newUntracked.length > 0) {
      const untrackedPatch = await synthesizeUntrackedPatch(
        workspaceRoot,
        newUntracked,
      );
      if (untrackedPatch) {
        rawPatch = rawPatch
          ? `${rawPatch}\n\n${untrackedPatch}`
          : untrackedPatch;
      }
    }

    return {
      baseBranch: resolvedBase,
      headBranch,
      changedFiles,
      rawPatch,
      scope: "working",
    };
  }

  if (headBranch !== resolvedBase && resolvedBase !== "HEAD") {
    try {
      [nameStatus, rawPatch] = await Promise.all([
        runGit(workspaceRoot, ["diff", "--name-status", resolvedBase]),
        runGit(workspaceRoot, ["diff", resolvedBase]),
      ]);
    } catch {
      try {
        [nameStatus, rawPatch] = await Promise.all([
          runGit(workspaceRoot, [
            "diff",
            "--name-status",
            `${resolvedBase}...HEAD`,
          ]),
          runGit(workspaceRoot, ["diff", `${resolvedBase}...HEAD`]),
        ]);
      } catch {
        [nameStatus, rawPatch] = await Promise.all([
          runGit(workspaceRoot, ["diff", "--name-status", "HEAD"]),
          runGit(workspaceRoot, ["diff", "HEAD"]),
        ]);
      }
    }
  } else {
    [nameStatus, rawPatch] = await Promise.all([
      runGit(workspaceRoot, ["diff", "--name-status", "HEAD"]),
      runGit(workspaceRoot, ["diff", "HEAD"]),
    ]);

    if (!nameStatus) {
      try {
        await runGit(workspaceRoot, ["rev-parse", "--verify", "HEAD~1"]);
        [nameStatus, rawPatch] = await Promise.all([
          runGit(workspaceRoot, ["diff", "--name-status", "HEAD~1..HEAD"]),
          runGit(workspaceRoot, ["diff", "HEAD~1..HEAD"]),
        ]);
      } catch {}
    }
  }

  const changedFiles = parseNameStatus(nameStatus);
  const existingPaths = new Set(changedFiles.map((f) => f.path));

  const untracked = await getUntrackedFiles(workspaceRoot);
  const newUntracked = untracked.filter((u) => !existingPaths.has(u));

  for (const u of newUntracked) {
    changedFiles.push({ path: u, status: "added" });
  }

  if (newUntracked.length > 0) {
    const untrackedPatch = await synthesizeUntrackedPatch(
      workspaceRoot,
      newUntracked,
    );
    if (untrackedPatch) {
      rawPatch = rawPatch ? `${rawPatch}\n\n${untrackedPatch}` : untrackedPatch;
    }
  }

  return {
    baseBranch: resolvedBase,
    headBranch,
    changedFiles,
    rawPatch,
    scope: "branch",
  };
}
