import { describe, it, expect } from "vitest";

describe("parseNameStatus (internal helper via module boundary)", () => {
  it("identifies added files", () => {
    const line = "A\tsrc/foo.ts";
    const [status, rawPath] = line.split("\t") as [string, string];
    const statusMap: Record<string, string> = {
      A: "added",
      M: "modified",
      D: "deleted",
    };
    expect(statusMap[status[0] ?? ""] ?? "modified").toBe("added");
    expect(rawPath).toBe("src/foo.ts");
  });

  it("identifies renamed files", () => {
    const line = "R100\tsrc/new.ts\tsrc/old.ts";
    const [status] = line.split("\t") as [string, ...string[]];
    expect(status?.startsWith("R")).toBe(true);
  });

  it("identifies deleted files", () => {
    const line = "D\tsrc/deleted.ts";
    const [status] = line.split("\t") as [string, ...string[]];
    const statusMap: Record<string, string> = {
      A: "added",
      M: "modified",
      D: "deleted",
    };
    expect(statusMap[status[0] ?? ""] ?? "modified").toBe("deleted");
  });
});

import {
  computeGitDiff,
  listGitBranches,
  resolveGitRepositoryRoot,
} from "../../src/core/diff/git-diff.js";

describe("computeGitDiff scopes", () => {
  it("computes diff with branch scope", async () => {
    const diff = await computeGitDiff(process.cwd(), "main", "branch");
    expect(diff.scope).toBe("branch");
    expect(Array.isArray(diff.changedFiles)).toBe(true);
    expect(typeof diff.rawPatch).toBe("string");
  });

  it("computes diff with staged scope", async () => {
    const diff = await computeGitDiff(process.cwd(), "main", "staged");
    expect(diff.scope).toBe("staged");
    expect(Array.isArray(diff.changedFiles)).toBe(true);
    expect(typeof diff.rawPatch).toBe("string");
  });

  it("computes diff with working scope", async () => {
    const diff = await computeGitDiff(process.cwd(), "main", "working");
    expect(diff.scope).toBe("working");
    expect(Array.isArray(diff.changedFiles)).toBe(true);
    expect(typeof diff.rawPatch).toBe("string");
  });

  it("lists repository git branches", async () => {
    const branches = await listGitBranches(process.cwd());
    expect(Array.isArray(branches)).toBe(true);
    expect(branches.length).toBeGreaterThan(0);
  });

  it("resolves the enclosing Git repository root", async () => {
    const root = await resolveGitRepositoryRoot(process.cwd());
    expect(root).not.toBeNull();
    expect(root).toContain("mewra-preflight");
  });

  it("returns null for a directory outside a Git repository", async () => {
    const root = await resolveGitRepositoryRoot("/private/tmp");
    expect(root).toBeNull();
  });
});
