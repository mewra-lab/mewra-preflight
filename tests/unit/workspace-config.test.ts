import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadWorkspaceConfig,
  mergeWorkspaceConfig,
} from "../../src/core/config/workspace-config.js";
import type { PreFlightConfig } from "../../src/shared/types.js";

describe("workspace-config", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pf-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null when configuration file does not exist", async () => {
    const config = await loadWorkspaceConfig(tempDir);
    expect(config).toBeNull();
  });

  it("parses valid JSON configuration", async () => {
    const configPath = join(tempDir, ".mewra-preflight.json");
    await writeFile(
      configPath,
      JSON.stringify({
        targetBranch: "develop",
        universalChecks: {
          largeFileThresholdMb: 2,
        },
        manualChecklist: [
          {
            id: "migration",
            label: "Applied DB migration",
          },
        ],
      }),
      "utf-8",
    );

    const loaded = await loadWorkspaceConfig(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.targetBranch).toBe("develop");
    expect(loaded?.universalChecks?.largeFileThresholdMb).toBe(2);
    expect(loaded?.manualChecklist).toHaveLength(1);
  });

  it("parses JSON with comments (JSONC)", async () => {
    const configPath = join(tempDir, ".mewra-preflight.json");
    const jsonc = `{
      // Target branch override
      "targetBranch": "staging",
      /* manual checklist */
      "manualChecklist": []
    }`;
    await writeFile(configPath, jsonc, "utf-8");

    const loaded = await loadWorkspaceConfig(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.targetBranch).toBe("staging");
  });

  it("merges workspace file config into base vscode config", () => {
    const base: PreFlightConfig = {
      targetBranch: "main",
      enabledPacks: ["universal", "js-ts"],
      blockingOnWarnings: false,
      gitHost: "github",
      diffScope: "branch",
    };

    const merged = mergeWorkspaceConfig(base, {
      targetBranch: "develop",
      universalChecks: { largeFileThresholdMb: 5 },
      manualChecklist: [{ id: "m1", label: "Check 1" }],
    });

    expect(merged.targetBranch).toBe("develop");
    expect(merged.largeFileThresholdMb).toBe(5);
    expect(merged.manualChecklist).toHaveLength(1);
    expect(merged.gitHost).toBe("github");
  });
});
