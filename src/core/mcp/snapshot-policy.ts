import type { GitDiff, PreFlightConfigFile } from "../../shared/types.js";

export function assertSnapshotInputsCurrent(
  expected: unknown,
  current: unknown,
): void {
  if (JSON.stringify(expected) !== JSON.stringify(current)) {
    throw new Error(
      "PreFlight inputs changed since the last pipeline. Run PreFlight Pipeline again before using MCP re-run.",
    );
  }
}

export function snapshotInputs(
  diff: GitDiff,
  config: unknown,
  ignores: unknown,
): unknown {
  return { diff, config, ignores };
}

export function effectiveMcpConfig(config: PreFlightConfigFile | null) {
  if (!config?.mcp) return undefined;
  const agentItems = new Set(
    (config.manualChecklist ?? [])
      .filter((item) => item.agentCheckable === true)
      .map((item) => item.id),
  );
  return {
    ...config.mcp,
    agentCheckableManualChecks: (
      config.mcp.agentCheckableManualChecks ?? []
    ).filter((id) => agentItems.has(id)),
  };
}
