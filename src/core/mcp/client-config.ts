export type McpClient = "codex" | "claude-code" | "cursor" | "vscode" | "http";

export function formatMcpClientConfig(
  client: McpClient,
  url: string,
  headers: Record<string, string>,
): { configuration: string; instructions: string } {
  const server = { type: "http", url, headers };
  if (client === "codex") {
    return {
      configuration:
        [
          "[mcp_servers.mewra_preflight]",
          `url = ${JSON.stringify(url)}`,
          `http_headers = { Authorization = ${JSON.stringify(headers.Authorization)} }`,
          'enabled_tools = ["get_preflight_status", "get_check_findings", "run_check"]',
          "tool_timeout_sec = 600",
        ].join("\n") + "\n",
      instructions:
        "Merge into private ~/.codex/config.toml and restart the Codex session.",
    };
  }
  const configuration =
    client === "vscode"
      ? { servers: { mewra_preflight: server } }
      : client === "cursor"
        ? { mcpServers: { mewra_preflight: { url, headers } } }
        : client === "claude-code"
          ? { mcpServers: { mewra_preflight: server } }
          : server;
  const instructions: Record<Exclude<McpClient, "codex">, string> = {
    "claude-code":
      "Merge the mcpServers entry into private ~/.claude.json, or import its server object with Claude Code's add-json command. Restart the session.",
    cursor:
      "Merge into private ~/.cursor/mcp.json and refresh the MCP connection.",
    vscode:
      "Use MCP: Open User Configuration and merge the servers entry; then restart the MCP server.",
    http: "Configure your local HTTP MCP client with this URL and Authorization header.",
  };
  return {
    configuration: JSON.stringify(configuration, null, 2) + "\n",
    instructions: instructions[client],
  };
}
