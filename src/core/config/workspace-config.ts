import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  PreFlightConfig,
  PreFlightConfigFile,
} from "../../shared/types.js";

// MARK: - Helpers

function stripJsonComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^\\:])\/\/.*$/gm, "$1");
}

// MARK: - Loader

export async function loadWorkspaceConfig(
  workspaceRoot: string,
): Promise<PreFlightConfigFile | null> {
  const configPath = resolve(workspaceRoot, ".mewra-preflight.json");
  try {
    const raw = await readFile(configPath, "utf-8");
    const stripped = stripJsonComments(raw);
    const parsed = JSON.parse(stripped) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as PreFlightConfigFile;
    }
    return null;
  } catch {
    return null;
  }
}

// MARK: - Merger

export function mergeWorkspaceConfig(
  base: PreFlightConfig,
  fileConfig: PreFlightConfigFile | null,
): PreFlightConfig {
  if (!fileConfig) return base;

  const merged: PreFlightConfig = {
    ...base,
    targetBranch: fileConfig.targetBranch ?? base.targetBranch,
  };

  if (fileConfig.manualChecklist !== undefined) {
    merged.manualChecklist = fileConfig.manualChecklist;
  }

  if (fileConfig.universalChecks !== undefined) {
    merged.universalChecks = fileConfig.universalChecks;
    if (fileConfig.universalChecks.largeFileThresholdMb !== undefined) {
      merged.largeFileThresholdMb =
        fileConfig.universalChecks.largeFileThresholdMb;
    }
  }

  return merged;
}
