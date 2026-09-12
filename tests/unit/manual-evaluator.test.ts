import { describe, it, expect } from "vitest";
import { evaluateManualChecks } from "../../src/core/checks/manual-evaluator.js";
import type { ChangedFile, ManualCheckConfig } from "../../src/shared/types.js";

describe("evaluateManualChecks", () => {
  it("triggers unconditional manual checks", () => {
    const configs: ManualCheckConfig[] = [
      { id: "review-env", label: "Reviewed environment changes" },
    ];
    const files: ChangedFile[] = [{ path: "src/index.ts", status: "modified" }];
    const checked = new Map<string, boolean>([["review-env", true]]);

    const results = evaluateManualChecks(configs, files, checked);

    expect(results).toHaveLength(1);
    expect(results[0]?.triggered).toBe(true);
    expect(results[0]?.checked).toBe(true);
    expect(results[0]?.severity).toBe("error");
  });

  it("triggers check when modified files match condition", () => {
    const configs: ManualCheckConfig[] = [
      {
        id: "db-migration",
        label: "Applied database migration",
        condition: { modifiedFilesMatch: "prisma/migrations/**" },
      },
    ];
    const files: ChangedFile[] = [
      { path: "prisma/migrations/001_init/migration.sql", status: "added" },
      { path: "src/api.ts", status: "modified" },
    ];
    const checked = new Map<string, boolean>();

    const results = evaluateManualChecks(configs, files, checked);

    expect(results).toHaveLength(1);
    expect(results[0]?.triggered).toBe(true);
    expect(results[0]?.checked).toBe(false);
  });

  it("does not trigger check when modified files do not match condition", () => {
    const configs: ManualCheckConfig[] = [
      {
        id: "db-migration",
        label: "Applied database migration",
        condition: { modifiedFilesMatch: "prisma/migrations/**" },
      },
    ];
    const files: ChangedFile[] = [{ path: "src/api.ts", status: "modified" }];
    const checked = new Map<string, boolean>();

    const results = evaluateManualChecks(configs, files, checked);

    expect(results).toHaveLength(1);
    expect(results[0]?.triggered).toBe(false);
  });
});
