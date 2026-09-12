import type { CheckRunner } from "../../check-contract.js";
import { noConsoleLog } from "./no-console-log.js";
import { noDebugger } from "./no-debugger.js";
import { noEnvLeak } from "./no-env-leak.js";

export function buildUniversalPack(): CheckRunner[] {
  return [noConsoleLog, noDebugger, noEnvLeak];
}
