import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { computeGitDiff } from "../../src/core/diff/git-diff.js";
import { parseAddedLines } from "../../src/core/diff/parse-patch.js";

const execFileAsync = promisify(execFile);
const repositories: string[] = [];

async function createRepository(bytes: number): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "preflight-large-diff-"));
  repositories.push(root);
  const git = async (...args: string[]) =>
    execFileAsync("git", args, { cwd: root });
  await git("init", "--initial-branch=main");
  await git(
    "-c",
    "user.name=PreFlight Test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--allow-empty",
    "-m",
    "initial",
  );
  await git("checkout", "-b", "feature");
  await writeFile(
    join(root, "large.ts"),
    "export const value = 1;\n".repeat(Math.ceil(bytes / 24)),
  );
  await git("add", "--", "large.ts");
  return root;
}

afterEach(async () => {
  await Promise.all(
    repositories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("large Git diffs", () => {
  it("does not scan the last commit when the working tree is clean", async () => {
    const root = await createRepository(24);
    await execFileAsync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "source",
      ],
      { cwd: root },
    );
    const diff = await computeGitDiff(root, "main", "working");
    expect(diff.changedFiles).toEqual([]);
    expect(diff.rawPatch).toBe("");
  });
  it("does not read outside the repository through an untracked symlink", async () => {
    const root = await createRepository(0);
    const outside = await mkdtemp(join(tmpdir(), "preflight-link-target-"));
    repositories.push(outside);
    await writeFile(join(outside, "target"), "REAL_SECRET_CANARY");
    await symlink(join(outside, "target"), join(root, "link.ts"));
    const diff = await computeGitDiff(root, "main", "working");
    expect(diff.rawPatch).not.toContain("REAL_SECRET_CANARY");
  });
  it("preserves untracked filename whitespace in metadata and findings", async () => {
    const root = await createRepository(0);
    const path = " a\tb.ts ";
    await writeFile(join(root, path), "debugger;\n");
    const diff = await computeGitDiff(root, "main", "working");
    expect(diff.changedFiles.some((file) => file.path === path)).toBe(true);
    expect(
      parseAddedLines(diff.rawPatch).some(
        (line) => line.file === path && line.content === "debugger;",
      ),
    ).toBe(true);
  });
  it("preserves rename paths containing tabs and Unicode", async () => {
    const root = await createRepository(24);
    await execFileAsync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "source",
      ],
      { cwd: root },
    );
    await execFileAsync("git", ["mv", "--", "large.ts", "new\tไฟล์.ts"], {
      cwd: root,
    });
    const diff = await computeGitDiff(root, "main", "staged");
    expect(diff.changedFiles).toEqual([
      { path: "new\tไฟล์.ts", status: "renamed", oldPath: "large.ts" },
    ]);
  });
  it("includes untracked text files above 1 MiB", async () => {
    const root = await createRepository(0);
    await writeFile(
      join(root, "untracked.ts"),
      "const value = 1;\n".repeat(100000),
    );
    const diff = await computeGitDiff(root, "main", "working");
    expect(diff.changedFiles.some((file) => file.path === "untracked.ts")).toBe(
      true,
    );
    expect(diff.rawPatch).toContain('+++ "b/untracked.ts"');
    expect(diff.rawPatch).toContain("+const value = 1;");
  });
  it.each(["staged", "working", "branch"] as const)(
    "preserves the complete patch above 1 MiB in %s scope",
    async (scope) => {
      const root = await createRepository(2 * 1024 * 1024);
      const diff = await computeGitDiff(root, "main", scope);
      const { stdout } = await execFileAsync(
        "git",
        scope === "staged" ? ["diff", "--cached"] : ["diff", "main"],
        { cwd: root, maxBuffer: 32 * 1024 * 1024 },
      );
      expect(Buffer.byteLength(diff.rawPatch)).toBeGreaterThan(1024 * 1024);
      expect(diff.rawPatch).toBe(stdout.trim());
      expect(diff.changedFiles).toEqual([
        { path: "large.ts", status: "added" },
      ]);
    },
  );

  it.each(["staged", "working", "branch"] as const)(
    "rejects oversized output without returning a partial %s diff",
    async (scope) => {
      const root = await createRepository(33 * 1024 * 1024);
      await expect(computeGitDiff(root, "main", scope)).rejects.toThrow(
        "32 MiB safety limit",
      );
    },
    30000,
  );
});
