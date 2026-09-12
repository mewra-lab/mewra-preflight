import type {
  CheckRunner,
  PreFlightContext,
} from "../checks/check-contract.js";
import type {
  GitDiff,
  CheckFinding,
  CheckResult,
  PreFlightSnapshot,
} from "../../shared/types.js";

// MARK: - Types

export type DraftPR = {
  title: string;
  body: string;
};

// MARK: - Handler

export class PreFlightMcpHandler {
  private _latestSnapshot: PreFlightSnapshot | null = null;
  private _draftPR: DraftPR | null = null;
  private readonly _manualChecks = new Map<string, boolean>();
  private readonly _getChecks: () => CheckRunner[];

  constructor(getChecks: () => CheckRunner[]) {
    this._getChecks = getChecks;
  }

  updateSnapshot(snapshot: PreFlightSnapshot): void {
    this._latestSnapshot = snapshot;
  }

  setDraftPR(draft: DraftPR): void {
    this._draftPR = draft;
  }

  get_preflight_status(): PreFlightSnapshot | null {
    return this._latestSnapshot;
  }

  get_check_findings(checkId: string): CheckFinding[] {
    if (!this._latestSnapshot) return [];
    const check = this._latestSnapshot.checks.find(
      (c) => c.definition.id === checkId,
    );
    return check?.result.findings ?? [];
  }

  async run_check(
    checkId: string,
    diff: GitDiff,
    context: PreFlightContext,
  ): Promise<CheckResult> {
    const checks = this._getChecks();
    const target = checks.find((c) => c.id === checkId);

    if (!target) {
      throw new Error(
        `Unknown checkId "${checkId}". Arbitrary check execution is disallowed.`,
      );
    }

    if (!target.appliesTo(diff)) {
      return { status: "skipped", findings: [] };
    }

    return target.run(diff, context);
  }

  mark_manual_check(
    checkId: string,
    done: boolean,
    allowedChecks?: string[],
  ): void {
    if (allowedChecks && !allowedChecks.includes(checkId)) {
      throw new Error(
        `Manual check "${checkId}" is not allowed to be modified by agents.`,
      );
    }
    this._manualChecks.set(checkId, done);
  }

  getManualCheckStatus(checkId: string): boolean {
    return this._manualChecks.get(checkId) ?? false;
  }

  getResource(uri: string): unknown {
    if (uri === "preflight://dashboard") {
      return this._latestSnapshot;
    }
    if (uri === "preflight://pr-draft") {
      return this._draftPR;
    }
    return null;
  }
}
