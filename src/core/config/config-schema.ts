import { z } from "zod";

const timeout = z.number().int().min(1).max(600_000);
const enabled = { enabled: z.boolean().optional() };
const toolSettings = (tools: [string, ...string[]]) =>
  z.strictObject({
    ...enabled,
    tool: z.enum(tools).optional(),
    timeoutMs: timeout.optional(),
  });
const pairing = z.strictObject({
  ...enabled,
  pattern: z.string().min(1).optional(),
  timeoutMs: timeout.optional(),
});
const ecosystems = z.strictObject({
  "js-ts": z
    .strictObject({
      ...enabled,
      format: toolSettings(["prettier"]).optional(),
      lint: toolSettings(["eslint"]).optional(),
      typecheck: toolSettings(["tsc", "vue-tsc"]).optional(),
      testPairing: pairing.optional(),
    })
    .optional(),
  go: z
    .strictObject({
      ...enabled,
      format: toolSettings(["gofmt"]).optional(),
      lint: toolSettings(["golangci-lint"]).optional(),
      vet: z
        .strictObject({ ...enabled, timeoutMs: timeout.optional() })
        .optional(),
      testPairing: pairing.optional(),
    })
    .optional(),
  python: z
    .strictObject({
      ...enabled,
      format: toolSettings(["ruff", "black"]).optional(),
      lint: toolSettings(["ruff", "flake8"]).optional(),
      typecheck: toolSettings(["mypy"]).optional(),
      testPairing: pairing.optional(),
    })
    .optional(),
  php: z
    .strictObject({
      ...enabled,
      format: toolSettings(["php-cs-fixer"]).optional(),
      analyze: toolSettings(["phpstan", "psalm"]).optional(),
      testPairing: pairing.optional(),
    })
    .optional(),
  "orm-cost-sentry": z.strictObject(enabled).optional(),
  "style-guardian": z.strictObject(enabled).optional(),
});
const severity = z.enum(["error", "warning"]);
const customCheck = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  tool: z.string().min(1),
  args: z.array(z.string()).optional(),
  appendChangedFiles: z.boolean().optional(),
  fileExtensions: z.array(z.string()).optional(),
  filesMatch: z.string().optional(),
  severity: severity.optional(),
  pack: z.string().optional(),
  fixArgs: z.array(z.string()).optional(),
  timeoutMs: timeout.optional(),
  dependsOn: z.array(z.string().min(1)).optional(),
});

export const WorkspaceConfigSchema = z.strictObject({
  $schema: z.string().optional(),
  targetBranch: z.string().min(1).optional(),
  ecosystems: ecosystems.optional(),
  universalChecks: z
    .strictObject({
      noDebugStatements: z.enum(["error", "warning", "off"]).optional(),
      noSecrets: z.enum(["error", "warning", "off"]).optional(),
      noLocalhostUrls: z.enum(["error", "warning", "off"]).optional(),
      noMergeConflicts: z.enum(["error", "warning", "off"]).optional(),
      largeFileThresholdMb: z.number().nonnegative().optional(),
    })
    .optional(),
  contributedChecks: z
    .record(
      z.string(),
      z.strictObject({
        enabled: z.boolean().optional(),
        severity: severity.optional(),
        timeoutMs: timeout.optional(),
      }),
    )
    .optional(),
  mcp: z
    .strictObject({
      enabled: z.boolean().optional(),
      exposedTools: z
        .array(
          z.enum([
            "get_preflight_status",
            "get_check_findings",
            "run_check",
            "mark_manual_check",
          ]),
        )
        .optional(),
      agentCheckableManualChecks: z.array(z.string()).optional(),
    })
    .optional(),
  manualChecklist: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        label: z.string().min(1),
        severity: severity.optional(),
        agentCheckable: z.boolean().optional(),
        condition: z
          .strictObject({ modifiedFilesMatch: z.string().optional() })
          .optional(),
      }),
    )
    .optional(),
  customChecks: z.array(customCheck).optional(),
  customPacks: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        label: z.string().min(1),
        ecosystemMarker: z.string().optional(),
        checks: z.array(customCheck),
      }),
    )
    .optional(),
});
