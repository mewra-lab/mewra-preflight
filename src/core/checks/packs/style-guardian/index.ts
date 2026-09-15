import type { CheckRunner } from "../../check-contract.js";
import { styleTailwindConflictsCheck } from "./tailwind-conflicts.js";

// MARK: - Pack Builder

export function buildStyleGuardianPack(): CheckRunner[] {
  return [styleTailwindConflictsCheck];
}
