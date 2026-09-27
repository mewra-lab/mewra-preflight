import { execFile } from "node:child_process";
import { readFile, lstat, readlink } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { GitDiff, ChangedFile, DiffScope } from "../../shared/types.js";

// MARK: - Types

type ExecError = { code?: number | string; stderr?: string };

// MARK: - Helpers

const execFileAsync = promisify(execFile);
const GIT_OUTPUT_LIMIT_BYTES = 32 * 1024 * 1024;

class GitOutputLimitError extends Error {
  constructor() {
    super(
      "Git output exceeds the 32 MiB safety limit. No checks were run on a partial diff. Reduce the selected diff (for example, stage a smaller batch) and re-run PreFlight.",
    );
    this.name = "GitOutputLimitError";
  }
}

function boundedPatch(patch: string): string {
  if (Buffer.byteLength(patch) > GIT_OUTPUT_LIMIT_BYTES)
    throw new GitOutputLimitError();
  return patch;
}

function isExecError(e: unknown): e is ExecError {
  return typeof e === "object" && e !== null && "code" in e;
}

function gitErrorSummary(stderr: string | undefined): string {
  const lines = (stderr ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const diagnostic = lines.find((line) => /^(fatal|error):/i.test(line));
  return diagnostic ?? lines[0] ?? "Git command failed.";
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const gitArgs =
      args[0] === "diff"
        ? [
            ...args,
            "--no-ext-diff",
            "--no-textconv",
            ...(args.includes("--name-status") ? ["-z"] : []),
          ]
        : [...args];
    const { stdout } = await execFileAsync("git", gitArgs, {
      cwd,
      maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
    });
    return gitArgs.includes("-z") ? stdout : stdout.trim();
  } catch (e) {
    if (isExecError(e) && e.code !== undefined) {
      if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
        throw new GitOutputLimitError();
      }
      throw new Error(
        `Git ${args[0]} failed (${typeof e.code === "number" ? "exit code" : "error code"} ${e.code}): ${gitErrorSummary(e.stderr)}`,
      );
    }
    throw e;
  }
}

export async function resolveGitRepositoryRoot(
  cwd: string,
): Promise<string | null> {
  try {
    const insideWorkTree = await runGit(cwd, [
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    if (insideWorkTree !== "true") return null;
    return await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
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
  let detectedDefault: string | null = null;
  if (baseBranch === "main") {
    try {
      const symRef = await runGit(cwd, [
        "symbolic-ref",
        "--short",
        "refs/remotes/origin/HEAD",
      ]);
      if (symRef) {
        detectedDefault = symRef.replace(/^origin\//, "");
      }
    } catch {}
  }

  const candidates = [
    baseBranch,
    `origin/${baseBranch}`,
    ...(detectedDefault && detectedDefault !== baseBranch
      ? [detectedDefault, `origin/${detectedDefault}`]
      : []),
    ...(baseBranch === "main"
      ? [
          "develop",
          "origin/develop",
          "dev",
          "origin/dev",
          "master",
          "origin/master",
        ]
      : []),
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

export async function listGitBranches(cwd: string): Promise<string[]> {
  try {
    const raw = await runGit(cwd, [
      "branch",
      "-a",
      "--format=%(refname:short)",
    ]);
    const seen = new Set<string>();
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.includes("HEAD")) continue;
      const normalized = trimmed.startsWith("origin/")
        ? trimmed.replace(/^origin\//, "")
        : trimmed;
      seen.add(normalized);
    }
    return Array.from(seen);
  } catch {
    return [];
  }
}

function parseNameStatus(raw: string): ChangedFile[] {
  const tokens = raw.split("\0");
  const files: ChangedFile[] = [];
  for (let i = 0; i < tokens.length - 1;) {
    const status = tokens[i++] ?? "";
    const path = tokens[i++] ?? "";
    if (status.startsWith("R") || status.startsWith("C")) {
      const newPath = tokens[i++] ?? "";
      files.push(
        status.startsWith("R")
          ? { path: newPath, status: "renamed", oldPath: path }
          : { path: newPath, status: "added" },
      );
      continue;
    }
    const statusMap: Record<string, ChangedFile["status"]> = {
      A: "added",
      M: "modified",
      D: "deleted",
    };
    files.push({
      path,
      status: statusMap[status[0] ?? ""] ?? "modified",
    });
  }
  return files;
}

async function getUntrackedFiles(cwd: string): Promise<string[]> {
  const raw = await runGit(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  return raw.split("\0").filter(Boolean);
}

async function synthesizeUntrackedPatch(
  cwd: string,
  files: string[],
): Promise<string> {
  const patches: string[] = [];
  let totalBytes = 0;

  for (const file of files) {
    try {
      const fullPath = resolve(cwd, file);
      const s = await lstat(fullPath);
      if (s.isDirectory()) continue;
      if (s.size > GIT_OUTPUT_LIMIT_BYTES) throw new GitOutputLimitError();

      const buffer = s.isSymbolicLink()
        ? Buffer.from(await readlink(fullPath))
        : await readFile(fullPath);
      if (buffer.includes(0)) continue;
      const content = buffer.toString("utf8");
      const lines = content.split("\n");
      const patchLines = [
        `diff --git ${JSON.stringify(`a/${file}`)} ${JSON.stringify(`b/${file}`)}`,
        "new file mode 100644",
        "--- /dev/null",
        `+++ ${JSON.stringify(`b/${file}`)}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((l) => `+${l}`),
      ];
      const patch = patchLines.join("\n");
      totalBytes += Buffer.byteLength(patch);
      if (totalBytes > GIT_OUTPUT_LIMIT_BYTES) throw new GitOutputLimitError();
      patches.push(patch);
    } catch (error) {
      if (error instanceof GitOutputLimitError) throw error;
      throw new Error(
        "An untracked file could not be read. Re-run after resolving file permissions or concurrent changes.",
      );
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
  const repositoryRoot = await resolveGitRepositoryRoot(workspaceRoot);
  if (!repositoryRoot) {
    throw new Error(
      "No Git repository was found. Select a repository folder or open a file inside one.",
    );
  }
  workspaceRoot = repositoryRoot;
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
      rawPatch: boundedPatch(rawPatch),
      scope: "working",
    };
  }

  if (headBranch !== resolvedBase && resolvedBase !== "HEAD") {
    try {
      [nameStatus, rawPatch] = await Promise.all([
        runGit(workspaceRoot, ["diff", "--name-status", resolvedBase]),
        runGit(workspaceRoot, ["diff", resolvedBase]),
      ]);
    } catch (error) {
      if (error instanceof GitOutputLimitError) throw error;
      try {
        [nameStatus, rawPatch] = await Promise.all([
          runGit(workspaceRoot, [
            "diff",
            "--name-status",
            `${resolvedBase}...HEAD`,
          ]),
          runGit(workspaceRoot, ["diff", `${resolvedBase}...HEAD`]),
        ]);
      } catch (error) {
        if (error instanceof GitOutputLimitError) throw error;
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
      } catch (error) {
        if (error instanceof GitOutputLimitError) throw error;
      }
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
    rawPatch: boundedPatch(rawPatch),
    scope: "branch",
  };
}
