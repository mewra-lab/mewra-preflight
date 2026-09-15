import { describe, it, expect } from "vitest";
import {
  parsePreflightIgnore,
  isPathIgnoredGlobally,
  isCheckIgnoredForFile,
  filterDiffForCheck,
  filterDiffByPreflightIgnore,
} from "../../src/core/config/preflight-ignore.js";
import type { GitDiff } from "../../src/shared/types.js";

// MARK: - Tests

describe("preflight-ignore — parser", () => {
  it("ignores comments and empty lines", () => {
    const text = `
    # This is a comment

    dist/**
    # Another comment
    *.generated.ts
    `;
    const rules = parsePreflightIgnore(text);
    expect(rules.globalIgnores).toHaveLength(2);
    expect(rules.targetedIgnores).toHaveLength(0);
  });

  it("parses targeted check and pack overrides", () => {
    const text = `
    scripts/**: universal:no-console-log
    legacy/**: pack:js-ts
    vendor/**: *
    build/**
    `;
    const rules = parsePreflightIgnore(text);
    expect(rules.globalIgnores).toHaveLength(1);
    expect(rules.targetedIgnores).toHaveLength(3);
    expect(rules.targetedIgnores[0]?.target).toBe("universal:no-console-log");
    expect(rules.targetedIgnores[1]?.target).toBe("pack:js-ts");
    expect(rules.targetedIgnores[2]?.target).toBe("*");
  });
});

describe("preflight-ignore — matching & filtering", () => {
  it("checks global file ignores", () => {
    const rules = parsePreflightIgnore("dist/**\n*.min.js");
    expect(isPathIgnoredGlobally("dist/bundle.js", rules)).toBe(true);
    expect(isPathIgnoredGlobally("dist/nested/app.js", rules)).toBe(true);
    expect(isPathIgnoredGlobally("src/utils.min.js", rules)).toBe(true);
    expect(isPathIgnoredGlobally("src/app.tsx", rules)).toBe(false);
  });

  it("filters diff changedFiles", () => {
    const rules = parsePreflightIgnore("dist/**\nfixtures/**");
    const diff: GitDiff = {
      baseBranch: "main",
      headBranch: "feat/test",
      changedFiles: [
        { path: "src/index.ts", status: "modified" },
        { path: "dist/bundle.js", status: "added" },
        { path: "fixtures/sample.json", status: "modified" },
      ],
      rawPatch: `diff --git a/src/index.ts b/src/index.ts
@@ -1 +1 @@
+const value = 1;
diff --git a/dist/bundle.js b/dist/bundle.js
@@ -1 +1 @@
+console.log("bundle");`,
    };

    const filtered = filterDiffByPreflightIgnore(diff, rules);
    expect(filtered.changedFiles).toHaveLength(1);
    expect(filtered.changedFiles[0]?.path).toBe("src/index.ts");
    expect(filtered.rawPatch).toContain("src/index.ts");
    expect(filtered.rawPatch).not.toContain("dist/bundle.js");
  });

  it("evaluates targeted check and pack ignore for files", () => {
    const rules = parsePreflightIgnore(`
      scripts/**: universal:no-console-log
      legacy/**: js-ts
      temp/**: *
    `);

    expect(
      isCheckIgnoredForFile(
        "universal:no-console-log",
        "universal",
        "scripts/seed.ts",
        rules,
      ),
    ).toBe(true);

    expect(
      isCheckIgnoredForFile(
        "universal:no-debugger",
        "universal",
        "scripts/seed.ts",
        rules,
      ),
    ).toBe(false);

    expect(
      isCheckIgnoredForFile("js-ts:prettier", "js-ts", "legacy/old.js", rules),
    ).toBe(true);

    expect(
      isCheckIgnoredForFile(
        "universal:no-debugger",
        "universal",
        "legacy/old.js",
        rules,
      ),
    ).toBe(false);

    expect(
      isCheckIgnoredForFile("any:check", "any", "temp/scratch.ts", rules),
    ).toBe(true);

    expect(
      isCheckIgnoredForFile("js-ts:prettier", "js-ts", "src/app.ts", rules),
    ).toBe(false);
  });

  it("filters targeted paths from the input for a specific check", () => {
    const rules = parsePreflightIgnore("scripts/**: js-ts");
    const diff: GitDiff = {
      baseBranch: "main",
      headBranch: "feat/test",
      changedFiles: [
        { path: "src/index.ts", status: "modified" },
        { path: "scripts/dev.ts", status: "modified" },
      ],
      rawPatch: `diff --git a/src/index.ts b/src/index.ts
@@ -1 +1 @@
+const value = 1;
diff --git a/scripts/dev.ts b/scripts/dev.ts
@@ -1 +1 @@
+console.log("dev");`,
    };

    const filtered = filterDiffForCheck(diff, "js-ts:prettier", "js-ts", rules);

    expect(filtered.changedFiles).toEqual([
      { path: "src/index.ts", status: "modified" },
    ]);
    expect(filtered.rawPatch).toContain("src/index.ts");
    expect(filtered.rawPatch).not.toContain("scripts/dev.ts");
  });
});
