import type { CheckRunner, PreFlightContext } from "./check-contract.js";
import type {
  GitDiff,
  CheckSnapshot,
  CheckStatus,
  PreFlightSnapshot,
  ManualCheckItem,
} from "../../shared/types.js";

// MARK: - Helpers

export function deriveOverallStatus(
  checks: CheckSnapshot[],
  manualChecks: ManualCheckItem[] = [],
): CheckStatus {
  if (checks.some((c) => c.result.status === "running")) return "running";

  const hasFailingCheck = checks.some(
    (c) => c.result.status === "fail" && c.definition.severity === "error",
  );
  const hasUncheckedBlockingManual = manualChecks.some(
    (m) => m.triggered && !m.checked && m.severity === "error",
  );

  if (hasFailingCheck || hasUncheckedBlockingManual) return "fail";

  const hasWarning =
    checks.some(
      (c) =>
        c.result.status === "warning" ||
        (c.result.status === "fail" && c.definition.severity === "warning"),
    ) ||
    manualChecks.some(
      (m) => m.triggered && !m.checked && m.severity === "warning",
    );

  if (hasWarning) return "warning";
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
  manualChecks: ManualCheckItem[] = [],
): Promise<PreFlightSnapshot> {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  const snapshots: CheckSnapshot[] = checks.map((c) => ({
    definition: {
      id: c.id,
      label: c.label,
      severity: c.severity,
      pack: c.pack,
      fixable: c.fixable,
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
      manualChecks,
      overallStatus: deriveOverallStatus(snapshots, manualChecks),
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
        const status =
          result.status === "fail" && check.severity === "warning"
            ? "warning"
            : result.status;
        snapshot.result = { ...result, status, durationMs: Date.now() - t0 };
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
    manualChecks,
    overallStatus: deriveOverallStatus(snapshots, manualChecks),
  };

  return cloneSnapshot(final);
}
