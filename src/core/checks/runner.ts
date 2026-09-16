import type { CheckRunner, PreFlightContext } from "./check-contract.js";
import type {
  GitDiff,
  CheckSnapshot,
  CheckStatus,
  PreFlightSnapshot,
  ManualCheckItem,
} from "../../shared/types.js";
import {
  type PreflightIgnoreRules,
  filterDiffForCheck,
  isCheckIgnoredForFile,
} from "../config/preflight-ignore.js";

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

export function deduplicateChecks(checks: CheckRunner[]): CheckRunner[] {
  const seen = new Set<string>();
  return checks.filter((check) => {
    if (seen.has(check.id)) return false;
    seen.add(check.id);
    return true;
  });
}

// MARK: - Runner

export async function runChecks(
  checks: CheckRunner[],
  diff: GitDiff,
  context: PreFlightContext,
  onProgress?: RunnerProgressCallback,
  manualChecks: ManualCheckItem[] = [],
  ignoreRules?: PreflightIgnoreRules,
): Promise<PreFlightSnapshot> {
  const uniqueChecks = deduplicateChecks(checks);
  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  const snapshots: CheckSnapshot[] = uniqueChecks.map((c) => ({
    definition: {
      id: c.id,
      label: c.label,
      severity: c.severity,
      pack: c.pack,
      fixable: c.fixable,
      installable: c.installable,
      setupCommand: c.setupCommand,
      resultCommand: c.resultCommand,
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
    uniqueChecks.map(async (check, i) => {
      const snapshot = snapshots[i];
      if (!snapshot) return;

      const checkDiff = ignoreRules
        ? filterDiffForCheck(diff, check.id, check.pack, ignoreRules)
        : diff;

      if (checkDiff.changedFiles.length === 0 && diff.changedFiles.length > 0) {
        snapshot.result = {
          status: "skipped",
          findings: [],
          message: "Skipped (all files ignored by .preflightignore)",
        };
        emit();
        return;
      }

      if (!check.appliesTo(checkDiff)) {
        snapshot.result = {
          status: "skipped",
          findings: [],
          message: "Skipped (no matching files in diff)",
        };
        emit();
        return;
      }

      snapshot.result = { status: "running", findings: [] };
      emit();

      const t0 = Date.now();
      try {
        const result = await check.run(checkDiff, context);
        let findings = result.findings;
        if (ignoreRules) {
          findings = findings.filter(
            (f) =>
              !isCheckIgnoredForFile(check.id, check.pack, f.file, ignoreRules),
          );
        }
        let routes = result.routes;
        if (routes && ignoreRules) {
          routes = routes.filter(
            (r) =>
              !isCheckIgnoredForFile(check.id, check.pack, r.file, ignoreRules),
          );
        }
        let status =
          result.status === "fail" && check.severity === "warning"
            ? "warning"
            : result.status;
        const hadContent =
          result.findings.length > 0 || (result.routes?.length ?? 0) > 0;
        const filteredToEmpty =
          findings.length === 0 && (routes?.length ?? 0) === 0;
        if (
          (result.status === "fail" || result.status === "warning") &&
          hadContent &&
          filteredToEmpty
        ) {
          status = "pass";
        }
        snapshot.result = {
          ...result,
          findings,
          routes,
          status,
          durationMs: Date.now() - t0,
        };
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
