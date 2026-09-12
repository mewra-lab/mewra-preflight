import type { CheckRunner } from "../../check-contract.js";
import { gofmtCheck } from "./gofmt.js";
import { govetCheck } from "./govet.js";
import { golangciCheck } from "./golangci.js";
import { goTestPairingCheck } from "./test-pairing.js";

// MARK: - Pack Builder

export function buildGoPack(): CheckRunner[] {
  return [gofmtCheck, govetCheck, golangciCheck, goTestPairingCheck];
}
