import type { CheckRunner } from "../../check-contract.js";
import type { CheckSeverity } from "../../../../shared/types.js";
import { noConsoleLog } from "./no-console-log.js";
import { noDebugger } from "./no-debugger.js";
import { noEnvLeak } from "./no-env-leak.js";
import { noLocalhostUrls } from "./no-localhost.js";
import { noMergeConflicts } from "./no-merge-conflicts.js";
import { createLargeFileWarning } from "./large-file.js";

// MARK: - Types

export type UniversalChecksConfig = {
  noDebugStatements?: "error" | "warning" | "off";
  noSecrets?: "error" | "warning" | "off";
  noLocalhostUrls?: "error" | "warning" | "off";
  noMergeConflicts?: "error" | "warning" | "off";
  largeFileThresholdMb?: number;
};

// MARK: - Helpers

function withSeverity(
  check: CheckRunner,
  severity: CheckSeverity,
): CheckRunner {
  return { ...check, severity };
}

// MARK: - Pack Builder

export function buildUniversalPack(
  options?: number | UniversalChecksConfig,
): CheckRunner[] {
  const config: UniversalChecksConfig =
    typeof options === "number"
      ? { largeFileThresholdMb: options }
      : (options ?? {});

  const runners: CheckRunner[] = [];

  const debugSev = config.noDebugStatements ?? "error";
  if (debugSev !== "off") {
    runners.push(withSeverity(noConsoleLog, debugSev));
    runners.push(withSeverity(noDebugger, debugSev));
  }

  const secretsSev = config.noSecrets ?? "error";
  if (secretsSev !== "off") {
    runners.push(withSeverity(noEnvLeak, secretsSev));
  }

  const localhostSev = config.noLocalhostUrls ?? "error";
  if (localhostSev !== "off") {
    runners.push(withSeverity(noLocalhostUrls, localhostSev));
  }

  const conflictSev = config.noMergeConflicts ?? "error";
  if (conflictSev !== "off") {
    runners.push(withSeverity(noMergeConflicts, conflictSev));
  }

  const threshold = config.largeFileThresholdMb ?? 1;
  if (threshold > 0) {
    runners.push(createLargeFileWarning(threshold));
  }

  return runners;
}
