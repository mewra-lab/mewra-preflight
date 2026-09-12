import type { CheckRunner } from "../../check-contract.js";
import { phpCsFixerCheck } from "./cs-fixer.js";
import { phpAnalyzeCheck } from "./analyze.js";
import { phpTestPairingCheck } from "./test-pairing.js";

// MARK: - Pack Builder

export function buildPhpPack(): CheckRunner[] {
  return [phpCsFixerCheck, phpAnalyzeCheck, phpTestPairingCheck];
}
