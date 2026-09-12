import type { CheckRunner } from "../../check-contract.js";
import { noConsoleLog } from "./no-console-log.js";
import { noDebugger } from "./no-debugger.js";
import { noEnvLeak } from "./no-env-leak.js";
import { noLocalhostUrls } from "./no-localhost.js";
import { noMergeConflicts } from "./no-merge-conflicts.js";
import { createLargeFileWarning } from "./large-file.js";

// MARK: - Pack Builder

export function buildUniversalPack(largeFileThresholdMb = 1): CheckRunner[] {
  return [
    noConsoleLog,
    noDebugger,
    noEnvLeak,
    noLocalhostUrls,
    noMergeConflicts,
    createLargeFileWarning(largeFileThresholdMb),
  ];
}
