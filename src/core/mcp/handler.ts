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
  private readonly _getChecks: () => CheckRunner[] | Promise<CheckRunner[]>;
  private _runRegisteredCheck:
    ((checkId: string) => Promise<CheckResult>) | undefined;
  private _markManualCheck:
    | ((checkId: string, done: boolean, allowedChecks: string[]) => void)
    | undefined;
  private _audit: ((message: string) => void) | undefined;

  constructor(getChecks: () => CheckRunner[] | Promise<CheckRunner[]>) {
    this._getChecks = getChecks;
  }

  updateSnapshot(snapshot: PreFlightSnapshot): void {
    this._latestSnapshot = snapshot;
  }

  setDraftPR(draft: DraftPR): void {
    this._draftPR = draft;
  }

  setAuditLogger(audit: (message: string) => void): void {
    this._audit = audit;
  }

  setRegisteredCheckRunner(
    runRegisteredCheck: (checkId: string) => Promise<CheckResult>,
  ): void {
    this._runRegisteredCheck = runRegisteredCheck;
  }

  setManualCheckUpdater(
    markManualCheck: (
      checkId: string,
      done: boolean,
      allowedChecks: string[],
    ) => void,
  ): void {
    this._markManualCheck = markManualCheck;
  }

  private _log(operation: string): void {
    this._audit?.(`MCP ${operation}`);
  }

  get_preflight_status(): PreFlightSnapshot | null {
    this._log("get_preflight_status");
    return this._latestSnapshot;
  }

  get_check_findings(checkId: string): CheckFinding[] {
    this._log(`get_check_findings ${checkId}`);
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
    this._log(`run_check ${checkId}`);
    const checks = await this._getChecks();
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
    this._log(`mark_manual_check ${checkId}`);
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
    this._log(`read_resource ${uri}`);
    if (uri === "preflight://dashboard") {
      return this._latestSnapshot;
    }
    if (uri === "preflight://pr-draft") {
      return this._draftPR;
    }
    return null;
  }

  async runRegisteredCheck(checkId: string): Promise<CheckResult> {
    this._log(`run_check ${checkId}`);
    if (!this._runRegisteredCheck) {
      throw new Error("Run the PreFlight dashboard before re-running a check.");
    }
    return this._runRegisteredCheck(checkId);
  }

  markAgentManualCheck(
    checkId: string,
    done: boolean,
    allowedChecks: string[],
  ): void {
    this._log(`mark_manual_check ${checkId}`);
    if (!this._markManualCheck) {
      throw new Error(
        "Run the PreFlight dashboard before updating a manual check.",
      );
    }
    this._markManualCheck(checkId, done, allowedChecks);
  }
}
