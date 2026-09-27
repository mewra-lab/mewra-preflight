import { describe, expect, it } from "vitest";
import { formatMcpClientConfig } from "../../src/core/mcp/client-config.js";

const url = "http://127.0.0.1:12345/mcp";
const headers = { Authorization: "Bearer test-only-placeholder" };

describe("MCP client configuration export", () => {
  it("formats Codex TOML with a restricted tool list", () => {
    const result = formatMcpClientConfig("codex", url, headers);
    expect(result.configuration).toContain("[mcp_servers.mewra_preflight]");
    expect(result.configuration).toContain(`url = "${url}"`);
    expect(result.configuration).toContain(
      'Authorization = "Bearer test-only-placeholder"',
    );
    expect(result.configuration).not.toContain("mark_manual_check");
  });

  it("exports Claude Code with an explicit HTTP transport", () => {
    const result = JSON.parse(
      formatMcpClientConfig("claude-code", url, headers).configuration,
    );
    expect(result.mcpServers.mewra_preflight).toEqual({
      type: "http",
      url,
      headers,
    });
  });

  it("uses Cursor's mcpServers wrapper", () => {
    const result = JSON.parse(
      formatMcpClientConfig("cursor", url, headers).configuration,
    );
    expect(result.mcpServers.mewra_preflight).toEqual({ url, headers });
  });

  it("uses VS Code's servers wrapper", () => {
    const result = JSON.parse(
      formatMcpClientConfig("vscode", url, headers).configuration,
    );
    expect(result.servers.mewra_preflight).toEqual({
      type: "http",
      url,
      headers,
    });
  });

  it("exports generic HTTP details without assuming a client's wrapper", () => {
    const result = JSON.parse(
      formatMcpClientConfig("http", url, headers).configuration,
    );
    expect(result).toEqual({ type: "http", url, headers });
  });
});
