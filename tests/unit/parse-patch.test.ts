import { describe, it, expect } from "vitest";
import {
  parseAddedLines,
  decodeGitPath,
} from "../../src/core/diff/parse-patch.js";

describe("Git quoted paths", () => {
  it("does not treat added ++ code as a destination header", () => {
    expect(
      parseAddedLines(
        "+++ b/src/app.ts\n@@ -0,0 +1,3 @@\n+++ counter;\n+debugger;\n+console.log('test');",
      ),
    ).toEqual([
      { file: "src/app.ts", line: 1, content: "++ counter;" },
      { file: "src/app.ts", line: 2, content: "debugger;" },
      { file: "src/app.ts", line: 3, content: "console.log('test');" },
    ]);
  });
  it("decodes C-quoted Unicode byte sequences", () => {
    expect(decodeGitPath('"b/\\340\\270\\201.ts"')).toBe("b/ก.ts");
  });
  it("preserves tabs, newlines, and trailing spaces in finding paths", () => {
    const path = "src/a\tb\nc .ts ";
    const lines = parseAddedLines(
      `+++ ${JSON.stringify(`b/${path}`)}\n@@ -0,0 +1 @@\n+debugger;`,
    );
    expect(lines[0]?.file).toBe(path);
  });
});

const samplePatch = `
diff --git a/src/calc.ts b/src/calc.ts
index 111..222 100644
--- a/src/calc.ts
+++ b/src/calc.ts
@@ -10,3 +10,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
diff --git a/src/auth.ts b/src/auth.ts
index 333..444 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,2 +1,3 @@
+// first line
-old line
+new line
`;

describe("parseAddedLines", () => {
  it("extracts added lines with correct file paths and line numbers", () => {
    const additions = parseAddedLines(samplePatch);
    expect(additions.length).toBe(3);

    expect(additions[0]).toEqual({
      file: "src/calc.ts",
      line: 11,
      content: "const b = 2;",
    });

    expect(additions[1]).toEqual({
      file: "src/auth.ts",
      line: 1,
      content: "// first line",
    });

    expect(additions[2]).toEqual({
      file: "src/auth.ts",
      line: 2,
      content: "new line",
    });
  });

  it("handles empty patch gracefully", () => {
    expect(parseAddedLines("")).toEqual([]);
  });
});
