import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createStarterConfig } from "../../src/core/config/starter-config.js";
import { WorkspaceConfigSchema } from "../../src/core/config/config-schema.js";
import {
  parsePreflightIgnore,
  isPathIgnoredGlobally,
} from "../../src/core/config/preflight-ignore.js";

describe("safe configuration starters", () => {
  it("preserves the target without forcing tools or checklist items", () => {
    const config = createStarterConfig("develop");
    expect(WorkspaceConfigSchema.parse(config)).toEqual({
      targetBranch: "develop",
      manualChecklist: [],
    });
  });

  it("keeps the shipped JSON example consistent with the generator", async () => {
    const config = JSON.parse(
      await readFile(
        new URL("../../.mewra-preflight.json.example", import.meta.url),
        "utf8",
      ),
    );
    expect(WorkspaceConfigSchema.parse(config)).toEqual(
      createStarterConfig("main"),
    );
  });

  it("ships no active ignore rules", async () => {
    const rules = parsePreflightIgnore(
      await readFile(
        new URL("../../.preflightignore.example", import.meta.url),
        "utf8",
      ),
    );
    expect(rules).toEqual({ globalIgnores: [], targetedIgnores: [] });
  });

  it("supports anchored directory rules and zero-directory globstars", () => {
    const rules = parsePreflightIgnore("/dist/\nsrc/**/*.ts");
    expect(isPathIgnoredGlobally("dist/assets/app.js", rules)).toBe(true);
    expect(isPathIgnoredGlobally("nested/dist/app.js", rules)).toBe(false);
    expect(isPathIgnoredGlobally("src/app.ts", rules)).toBe(true);
    expect(isPathIgnoredGlobally("src/nested/app.ts", rules)).toBe(true);
  });

  it("rejects ineffective re-inclusion with its line number", () => {
    expect(() => parsePreflightIgnore("# heading\n!src/app.ts")).toThrow(
      "line 2",
    );
  });
});
