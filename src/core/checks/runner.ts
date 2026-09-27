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
  const byId = new Map(uniqueChecks.map((check) => [check.id, check]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (check: CheckRunner): void => {
    if (visiting.has(check.id))
      throw new Error("Check dependencies contain a cycle.");
    if (visited.has(check.id)) return;
    visiting.add(check.id);
    for (const id of check.dependsOn ?? []) {
      const dependency = byId.get(id);
      if (!dependency)
        throw new Error(`Missing dependency ${id} for ${check.id}.`);
      visit(dependency);
    }
    visiting.delete(check.id);
    visited.add(check.id);
  };
  uniqueChecks.forEach(visit);
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
      actionCommand: c.actionCommand,
      actionLabel: c.actionLabel,
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

  const executions = new Map<string, Promise<void>>();
  const execute = (check: CheckRunner): Promise<void> => {
    const existing = executions.get(check.id);
    if (existing) return existing;
    const execution = Promise.resolve().then(async () => {
      await Promise.all(
        (check.dependsOn ?? []).map((id) => execute(byId.get(id)!)),
      );
      const i = uniqueChecks.indexOf(check);
      const snapshot = snapshots[i];
      if (!snapshot) return;
      if (
        (check.dependsOn ?? []).some((id) => {
          const dependency = snapshots[uniqueChecks.indexOf(byId.get(id)!)];
          return (
            dependency?.result.status !== "pass" &&
            dependency?.result.status !== "warning"
          );
        })
      ) {
        snapshot.result = {
          status: "not-configured",
          findings: [],
          message: "A required dependency did not complete successfully.",
        };
        emit();
        return;
      }

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
        const result = await check.run(
          checkDiff,
          check.timeoutMs === undefined
            ? context
            : {
                ...context,
                runCommand: (cmd, args, cwd, timeoutMs) =>
                  context.runCommand(
                    cmd,
                    args,
                    cwd,
                    check.timeoutMs ?? timeoutMs ?? 30_000,
                  ),
              },
        );
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
      } catch (error) {
        snapshot.result = {
          status: "fail",
          findings: [],
          message:
            error instanceof Error
              ? error.message
              : "Check threw an unexpected error.",
          durationMs: Date.now() - t0,
        };
      }

      emit();
    });
    executions.set(check.id, execution);
    return execution;
  };
  await Promise.all(uniqueChecks.map(execute));

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
