import type { CheckRunner } from "../../check-contract.js";
import { pythonFormatCheck } from "./format.js";
import { pythonLintCheck } from "./lint.js";
import { mypyCheck } from "./mypy.js";
import { pythonTestPairingCheck } from "./test-pairing.js";

// MARK: - Pack Builder

export function buildPythonPack(): CheckRunner[] {
  return [
    pythonFormatCheck,
    pythonLintCheck,
    mypyCheck,
    pythonTestPairingCheck,
  ];
}
