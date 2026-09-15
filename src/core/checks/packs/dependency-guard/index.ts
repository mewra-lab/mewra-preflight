import type { CheckRunner } from "../../check-contract.js";
import { dependencyUnsafeSourceCheck } from "./unsafe-source.js";

// MARK: - Pack Builder

export function buildDependencyGuardPack(): CheckRunner[] {
  return [dependencyUnsafeSourceCheck];
}
