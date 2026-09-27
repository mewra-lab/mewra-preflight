import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WorkspaceConfigSchema } from "./config-schema.js";
import type {
  PreFlightConfig,
  PreFlightConfigFile,
} from "../../shared/types.js";

// MARK: - Helpers

function stripJsonComments(input: string): string {
  let output = "";
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quoted) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') {
      quoted = true;
      output += char;
    } else if (char === "/" && input[i + 1] === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      output += "\n";
    } else if (char === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      if (end < 0) throw new Error("Unclosed configuration comment.");
      output += " ";
      i = end + 1;
    } else output += char;
  }
  return output;
}

// MARK: - Loader

export async function loadWorkspaceConfig(
  workspaceRoot: string,
): Promise<PreFlightConfigFile | null> {
  const configPath = resolve(workspaceRoot, ".mewra-preflight.json");
  try {
    const raw = await readFile(configPath, "utf-8");
    const stripped = stripJsonComments(raw);
    const parsed = WorkspaceConfigSchema.safeParse(JSON.parse(stripped));
    if (!parsed.success) {
      throw new Error(
        `Invalid configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.code === "unrecognized_keys" ? `unknown field(s) ${issue.keys.join(", ")}` : issue.message}`).join("; ")}. Open configuration and use its schema suggestions to correct these fields.`,
      );
    }
    return parsed.data as PreFlightConfigFile;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return null;
    throw new Error(
      `Cannot load .mewra-preflight.json: ${error instanceof SyntaxError ? "Invalid JSON syntax." : error instanceof Error ? error.message : "Read failed."}`,
    );
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

  if (fileConfig.customPacks !== undefined) {
    merged.customPacks = fileConfig.customPacks;
  }

  if (fileConfig.customChecks !== undefined) {
    merged.customChecks = fileConfig.customChecks;
  }

  return merged;
}
