# Using PreFlight MCP

## What it does

PreFlight runs a local HTTP MCP endpoint while its VS Code extension host is running. The endpoint requires a random session bearer token and accepts requests only for its loopback host. It serves the dashboard's latest snapshot, not a background full-repository scan.

| Tool                   | Use                                                                       |
| ---------------------- | ------------------------------------------------------------------------- |
| `get_preflight_status` | Read the last pipeline result and its check IDs.                          |
| `get_check_findings`   | Read findings using a check ID from that snapshot.                        |
| `run_check`            | Re-run a registered dashboard check and its required prerequisites.       |
| `mark_manual_check`    | Update a manual item only with explicit tool, item, and allowlist opt-in. |

Resources are `preflight://dashboard` and `preflight://pr-draft`. Before the first pipeline run, the snapshot is null; this is not a passed pipeline. There is no MCP tool to execute arbitrary shell commands, push, or create a PR.

## VS Code's native MCP client

1. Install the latest PreFlight VSIX and reload VS Code.
2. Open the repository and run **Mewra PreFlight: Run PreFlight Pipeline**.
3. In the native MCP tools picker, enable **Mewra PreFlight** and approve the server when prompted.
4. Ask the agent to call `get_preflight_status`, then `get_check_findings` for a returned check ID.
5. After fixing code, refresh the pipeline in the dashboard. The agent may then call `run_check` for a current registered ID. If diff, configuration, or ignore rules changed since the snapshot, MCP re-run stops with an instruction to refresh the pipeline instead of verifying stale input.

Calls appear in **Output → Mewra PreFlight MCP**. Dependency Guard and Pounce results appear in the same snapshot when their extensions are installed and their checks are registered. A skipped dependency check stays diff-scoped; use Dependency Guard's full-scan action separately.

## Codex CLI or IDE extension

Codex uses its own MCP configuration; native VS Code discovery alone does not connect Codex. Its CLI and IDE extension share configuration. See the [official Codex MCP documentation](https://developers.openai.com/codex/mcp).

1. Complete a PreFlight pipeline run in a trusted VS Code workspace.
2. Run **Mewra PreFlight: Copy MCP Connection for AI Agent** from the Command Palette and select **Codex**.
3. Confirm the warning. The clipboard now contains a connection URL and a private session credential.
4. Open your private `~/.codex/config.toml` and paste the block. If `[mcp_servers.mewra_preflight]` already exists, replace that block rather than creating a duplicate. Do not paste into a tracked project file.
5. Run `codex mcp list` to check registration, then restart your Codex session to load its tools. Listing configuration is not proof of a successful connection.
6. Ask: “Call mewra_preflight get_preflight_status, report blockers, and do not change manual checks.”

The copied block enables the three default tools, not manual mutation. Use a read-only client allowlist (`get_preflight_status`, `get_check_findings`) if re-runs are unnecessary. The command does not modify Codex configuration or launch another agent automatically.

The URL and token change when VS Code's extension host restarts. Repeat the copy step afterward. Clear the clipboard after pasting; do not post credentials in chat, logs, screenshots, issues, or source control. The endpoint is local-only and does not require Azure, a paid subscription, or a cloud account.

## Other AI agents

The same command offers client-specific configuration exports:

| Client                      | Private destination              | Export format                                      |
| --------------------------- | -------------------------------- | -------------------------------------------------- |
| Claude Code                 | `~/.claude.json`                 | `mcpServers` with `type: http`, URL and headers    |
| Cursor                      | `~/.cursor/mcp.json`             | `mcpServers` with URL and headers                  |
| VS Code / GitHub Copilot    | **MCP: Open User Configuration** | `servers` with `type: http`, URL and headers       |
| Other local HTTP MCP client | Client-specific private settings | Plain connection object with type, URL and headers |

Merge only the new entry into existing configuration; do not replace other settings. Reconnect the client, approve its tools, then ask it to call `get_preflight_status`. Claude Code can also import the individual server object via `claude mcp add-json`; the exported top-level wrapper is for the config file, not that command's argument. See [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Cursor MCP](https://cursor.com/docs/mcp), and [VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers) for client-specific setup.

All clients use the same server-side tool policy in `.mewra-preflight.json`. For read-only access, restrict `exposedTools` there. The Codex export additionally includes a client-side allowlist; the JSON exports do not assume equivalent allowlist fields exist in every client.

This requires a client running locally that supports Streamable HTTP and custom Authorization headers. Cloud agents cannot reach your machine's `127.0.0.1`. Stdio-only clients need a separate bridge, which this extension does not provide. Do not expose the server publicly to work around this limitation. Configuration exports are covered by tests, but live sessions of every listed agent have not been tested.

## Workspace access policy

For read-only tools:

```json
{
  "mcp": {
    "enabled": true,
    "exposedTools": ["get_preflight_status", "get_check_findings"]
  }
}
```

`exposedTools: []` exposes no tools. Resources remain available when MCP is enabled. To disable all MCP operations, set `mcp.enabled` to false; the server rejects already-connected authenticated clients too. MCP configuration follows the dashboard's selected repository, falling back to the first workspace folder before a repository is selected.

Manual mutation additionally requires `mark_manual_check` in `exposedTools`, the item's ID in `agentCheckableManualChecks`, and `agentCheckable: true` on the item. Keep this disabled unless the agent can actually verify the requirement.

Removing an item's agent authority takes effect on the next request, even before a dashboard refresh. Closed dashboards and changed repositories cannot reuse old re-run or manual-update callbacks.

## Verification and limitations

`tests/unit/mcp-server.test.ts` opens an actual loopback HTTP server and verifies initialization, notifications, tool discovery, status/findings, resources, a registered rerun, and rejected requests. VS Code definition classes and the pipeline fixture are test doubles: this verifies HTTP transport and policy, not a live editor or a Codex model session.

For a full editor check, install the VSIX, run the pipeline, connect the client, and confirm the corresponding calls in the MCP output channel. Tools cannot be dynamically added to an already-running agent session by changing source code alone.
