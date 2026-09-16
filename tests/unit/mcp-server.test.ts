import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreFlightSnapshot } from "../../src/shared/types.js";
import { PreFlightMcpHandler } from "../../src/core/mcp/handler.js";

vi.mock("vscode", () => ({
  Uri: { parse: (value: string) => ({ toString: () => value }) },
  McpHttpServerDefinition: class {
    constructor(
      readonly label: string,
      readonly uri: { toString: () => string },
      readonly headers: Record<string, string>,
      readonly version: string,
    ) {}
  },
}));

const { PreFlightMcpServer } =
  await import("../../src/extension/mcp-server.js");

const servers: InstanceType<typeof PreFlightMcpServer>[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.dispose();
});

type ServerDefinition = {
  uri: { toString: () => string };
  headers: Record<string, string>;
};

async function createServer(config = {}) {
  const handler = new PreFlightMcpHandler(() => []);
  const server = new PreFlightMcpServer(handler, async () => config, "0.7.0");
  servers.push(server);
  await server.start();
  return { handler, server, definition: server.definition as ServerDefinition };
}

async function request(
  definition: ServerDefinition,
  body: Record<string, unknown>,
  authorized = true,
): Promise<Response> {
  return fetch(definition.uri.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorized ? definition.headers : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PreFlightMcpServer", () => {
  it("requires the ephemeral bearer token before parsing requests", async () => {
    const { definition } = await createServer();

    const result = await request(
      definition,
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      false,
    );

    expect(result.status).toBe(403);
  });

  it("lists only configured tools and returns a snapshot", async () => {
    const { definition, handler } = await createServer({
      exposedTools: ["get_preflight_status"],
    });
    const snapshot: PreFlightSnapshot = {
      runId: "run-1",
      startedAt: 1,
      checks: [],
      manualChecks: [],
      overallStatus: "pass",
    };
    handler.updateSnapshot(snapshot);

    const tools = await request(definition, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const toolsPayload = (await tools.json()) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(toolsPayload.result.tools).toEqual([
      expect.objectContaining({ name: "get_preflight_status" }),
    ]);

    const status = await request(definition, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_preflight_status", arguments: {} },
    });
    const statusPayload = (await status.json()) as {
      result: { structuredContent: PreFlightSnapshot };
    };
    expect(statusPayload.result.structuredContent.runId).toBe("run-1");
  });

  it("does not expose manual mutation without explicit tool configuration", async () => {
    const { definition } = await createServer();

    const result = await request(definition, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "mark_manual_check",
        arguments: { checkId: "manual-migration", done: true },
      },
    });
    const payload = (await result.json()) as { error: { message: string } };

    expect(payload.error.message).toBe("MCP tool is not enabled.");
  });
});
