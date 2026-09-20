import type {
  GitDiff,
  CheckResult,
  CheckSeverity,
} from "../../shared/types.js";

// MARK: - Types

export type CommandResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export type PreFlightContext = {
  workspaceRoot: string;
  resolveTool(binName: string): Promise<string | null>;
  resolveTrustedTool?(binName: string): Promise<string | null>;
  runCommand(
    cmd: string,
    args: string[],
    cwd?: string,
    timeoutMs?: number,
  ): Promise<CommandResult>;
};

export type CheckRunner = {
  readonly id: string;
  readonly label: string;
  readonly severity: CheckSeverity;
  readonly pack: string;
  readonly fixable?: boolean;
  /** False when the check requires environment setup rather than a package install. */
  readonly installable?: boolean;
  /** Registered command that opens the check's own setup experience. */
  readonly setupCommand?: string;
  readonly resultCommand?: string;
  appliesTo(diff: GitDiff): boolean;
  run(diff: GitDiff, context: PreFlightContext): Promise<CheckResult>;
};
