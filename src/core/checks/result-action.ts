import type { CheckRunner } from "./check-contract.js";
import type { PreFlightSnapshot } from "../../shared/types.js";

export function resolveResultCommand(
  snapshot: PreFlightSnapshot | undefined,
  enabledChecks: CheckRunner[],
  checkId: string,
): string | undefined {
  const entry = snapshot?.checks.find(
    (check) => check.definition.id === checkId,
  );
  if (
    !entry ||
    entry.result.status === "pending" ||
    entry.result.status === "running"
  )
    return undefined;
  const command = enabledChecks.find(
    (check) => check.id === checkId,
  )?.resultCommand;
  if (
    !command ||
    command !== entry.definition.resultCommand ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(command)
  )
    return undefined;
  return command;
}
