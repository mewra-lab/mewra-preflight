import { z } from "zod";

export const CheckStatusSchema = z.enum([
  "pass",
  "fail",
  "warning",
  "not-configured",
  "skipped",
  "running",
  "pending",
]);

export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const CheckSeveritySchema = z.enum(["error", "warning"]);

export type CheckSeverity = z.infer<typeof CheckSeveritySchema>;

export const CheckFindingSchema = z.object({
  file: z.string(),
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative().optional(),
  message: z.string(),
  rule: z.string().optional(),
});

export type CheckFinding = z.infer<typeof CheckFindingSchema>;

export const CheckResultSchema = z.object({
  status: CheckStatusSchema,
  findings: z.array(CheckFindingSchema).default([]),
  message: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
});

export type CheckResult = z.infer<typeof CheckResultSchema>;

export const CheckDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  severity: CheckSeveritySchema,
  pack: z.string(),
});

export type CheckDefinition = z.infer<typeof CheckDefinitionSchema>;

export const DiffScopeSchema = z.enum(["branch", "staged", "working"]);

export type DiffScope = z.infer<typeof DiffScopeSchema>;

export const ChangedFileSchema = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "deleted", "renamed"]),
  oldPath: z.string().optional(),
});

export type ChangedFile = z.infer<typeof ChangedFileSchema>;

export const GitDiffSchema = z.object({
  baseBranch: z.string(),
  headBranch: z.string(),
  changedFiles: z.array(ChangedFileSchema),
  rawPatch: z.string(),
  scope: DiffScopeSchema.optional(),
});

export type GitDiff = z.infer<typeof GitDiffSchema>;

export const ManualCheckConditionSchema = z.object({
  modifiedFilesMatch: z.string().optional(),
});

export type ManualCheckCondition = z.infer<typeof ManualCheckConditionSchema>;

export const ManualCheckItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  severity: CheckSeveritySchema.default("error"),
  checked: z.boolean().default(false),
  condition: ManualCheckConditionSchema.optional(),
  triggered: z.boolean().default(true),
});

export type ManualCheckItem = z.infer<typeof ManualCheckItemSchema>;

export const CheckSnapshotSchema = z.object({
  definition: CheckDefinitionSchema,
  result: CheckResultSchema,
});

export type CheckSnapshot = z.infer<typeof CheckSnapshotSchema>;

export const PreFlightSnapshotSchema = z.object({
  runId: z.string(),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  diff: GitDiffSchema.optional(),
  checks: z.array(CheckSnapshotSchema),
  manualChecks: z.array(ManualCheckItemSchema).default([]),
  overallStatus: CheckStatusSchema,
});

export type PreFlightSnapshot = z.infer<typeof PreFlightSnapshotSchema>;

export type ManualCheckConfig = {
  id: string;
  label: string;
  severity?: "error" | "warning";
  condition?: {
    modifiedFilesMatch?: string;
  };
};

export type PreFlightConfigFile = {
  targetBranch?: string;
  ecosystems?: Record<string, { enabled?: boolean; [key: string]: unknown }>;
  universalChecks?: {
    noDebugStatements?: "error" | "warning" | "off";
    noSecrets?: "error" | "warning" | "off";
    noLocalhostUrls?: "error" | "warning" | "off";
    noMergeConflicts?: "error" | "warning" | "off";
    largeFileThresholdMb?: number;
  };
  contributedChecks?: Record<
    string,
    { enabled?: boolean; severity?: "error" | "warning" }
  >;
  manualChecklist?: ManualCheckConfig[];
};

export type PreFlightConfig = {
  targetBranch: string;
  enabledPacks: string[];
  blockingOnWarnings: boolean;
  gitHost: "github" | "gitlab";
  diffScope: DiffScope;
  manualChecklist?: ManualCheckConfig[];
  largeFileThresholdMb?: number;
  universalChecks?: {
    noDebugStatements?: "error" | "warning" | "off";
    noSecrets?: "error" | "warning" | "off";
    noLocalhostUrls?: "error" | "warning" | "off";
    noMergeConflicts?: "error" | "warning" | "off";
    largeFileThresholdMb?: number;
  };
};
