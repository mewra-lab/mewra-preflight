import type { CheckRunner } from "../../check-contract.js";
import { pounceBlastRadiusCheck } from "./blast-radius.js";

// MARK: - Pack Builder

export function buildPouncePack(): CheckRunner[] {
  return [pounceBlastRadiusCheck];
}
