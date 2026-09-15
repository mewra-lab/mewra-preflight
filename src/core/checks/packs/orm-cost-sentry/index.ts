import type { CheckRunner } from "../../check-contract.js";
import { ormDestructiveMigrationCheck } from "./destructive-migration.js";
import { ormQueryInLoopCheck } from "./query-in-loop.js";

// MARK: - Pack Builder

export function buildOrmCostSentryPack(): CheckRunner[] {
  return [ormQueryInLoopCheck, ormDestructiveMigrationCheck];
}
