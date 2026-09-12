import type {
  GitDiff,
  CheckResult,
  CheckSeverity,
} from "../../shared/types.js";

export type PreFlightContext = {
  workspaceRoot: string;
};

export type CheckRunner = {
  readonly id: string;
  readonly label: string;
  readonly severity: CheckSeverity;
  readonly pack: string;
  appliesTo(diff: GitDiff): boolean;
  run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult>;
};
