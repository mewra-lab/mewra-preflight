import type { CheckRunner, PreFlightContext } from "./check-contract.js";
import type {
  GitDiff,
  CheckSnapshot,
  CheckStatus,
  PreFlightSnapshot,
} from "../../shared/types.js";

// MARK: - Helpers

function deriveOverallStatus(checks: CheckSnapshot[]): CheckStatus {
  const statuses = checks.map((c) => c.result.status);
  if (statuses.some((s) => s === "fail")) return "fail";
  if (statuses.some((s) => s === "running")) return "running";
  if (statuses.some((s) => s === "warning")) return "warning";
  return "pass";
}

function cloneSnapshot(snapshot: PreFlightSnapshot): PreFlightSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PreFlightSnapshot;
}

// MARK: - Types

export type RunnerProgressCallback = (snapshot: PreFlightSnapshot) => void;

// MARK: - Runner

export async function runChecks(
  checks: CheckRunner[],
  diff: GitDiff,
  context: PreFlightContext,
  onProgress?: RunnerProgressCallback,
): Promise<PreFlightSnapshot> {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  const snapshots: CheckSnapshot[] = checks.map((c) => ({
    definition: {
      id: c.id,
      label: c.label,
      severity: c.severity,
      pack: c.pack,
    },
    result: { status: "pending", findings: [] },
  }));

  const emit = (finishedAt?: number): void => {
    const current: PreFlightSnapshot = {
      runId,
      startedAt,
      ...(finishedAt !== undefined ? { finishedAt } : {}),
      diff,
      checks: snapshots,
      overallStatus: deriveOverallStatus(snapshots),
    };
    if (onProgress) {
      onProgress(cloneSnapshot(current));
    }
  };

  emit();

  await Promise.all(
    checks.map(async (check, i) => {
      const snapshot = snapshots[i];
      if (!snapshot) return;

      if (!check.appliesTo(diff)) {
        snapshot.result = { status: "skipped", findings: [] };
        emit();
        return;
      }

      snapshot.result = { status: "running", findings: [] };
      emit();

      const t0 = Date.now();
      try {
        const result = await check.run(diff, context);
        snapshot.result = { ...result, durationMs: Date.now() - t0 };
      } catch {
        snapshot.result = {
          status: "fail",
          findings: [],
          message: "Check threw an unexpected error.",
          durationMs: Date.now() - t0,
        };
      }

      emit();
    }),
  );

  const finishedAt = Date.now();
  emit(finishedAt);

  const final: PreFlightSnapshot = {
    runId,
    startedAt,
    finishedAt,
    diff,
    checks: snapshots,
    overallStatus: deriveOverallStatus(snapshots),
  };

  return cloneSnapshot(final);
}
