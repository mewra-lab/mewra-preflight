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
  it("completes HTTP initialization, discovery, reads and a registered rerun", async () => {
    const { definition, handler } = await createServer();
    const rpc = async (method: string, params?: unknown) => {
      const result = await request(definition, {
        jsonrpc: "2.0",
        id: 1,
        method,
        ...(params ? { params } : {}),
      });
      expect(result.status).toBe(200);
      return result.json();
    };
    expect(
      await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "preflight-smoke", version: "1" },
      }),
    ).toMatchObject({
      result: {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "mewra-preflight" },
      },
    });
    const notification = await request(definition, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(notification.status).toBe(202);
    expect(
      (await rpc("tools/list")).result.tools.map(
        (tool: { name: string }) => tool.name,
      ),
    ).toEqual(["get_preflight_status", "get_check_findings", "run_check"]);
    const initial = await rpc("tools/call", {
      name: "get_preflight_status",
      arguments: {},
    });
    expect(initial.result.content[0].text).toBe("null");
    expect(initial.result).not.toHaveProperty("structuredContent");
    const finding = {
      file: "src/app.ts",
      line: 1,
      message: "Smoke fixture",
      rule: "smoke",
    };
    handler.updateSnapshot({
      runId: "http-smoke",
      startedAt: 1,
      checks: [
        {
          definition: {
            id: "universal:smoke",
            label: "Smoke",
            pack: "universal",
            severity: "error",
          },
          result: { status: "fail", findings: [finding] },
        },
      ],
      manualChecks: [],
      overallStatus: "fail",
    });
    handler.setRegisteredCheckRunner(async (id) => {
      if (id !== "universal:smoke") throw new Error("Unknown registered check");
      return { status: "pass", findings: [] };
    });
    expect(
      (await rpc("tools/call", { name: "get_preflight_status", arguments: {} }))
        .result.structuredContent.runId,
    ).toBe("http-smoke");
    const findings = await rpc("tools/call", {
      name: "get_check_findings",
      arguments: { checkId: "universal:smoke" },
    });
    expect(JSON.parse(findings.result.content[0].text)).toEqual([finding]);
    expect(findings.result).not.toHaveProperty("structuredContent");
    expect((await rpc("resources/list")).result.resources).toHaveLength(2);
    expect(
      JSON.parse(
        (await rpc("resources/read", { uri: "preflight://dashboard" })).result
          .contents[0].text,
      ).runId,
    ).toBe("http-smoke");
    expect(
      (
        await rpc("tools/call", {
          name: "run_check",
          arguments: { checkId: "universal:smoke" },
        })
      ).result.structuredContent.status,
    ).toBe("pass");
    expect(
      (
        await rpc("tools/call", {
          name: "run_check",
          arguments: { checkId: "arbitrary:command" },
        })
      ).error.message,
    ).toBe("Unknown registered check");
  });

  it("honors disabled configuration even for an authenticated existing connection", async () => {
    const { definition } = await createServer({ enabled: false });
    const result = await request(definition, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect((await result.json()).error.message).toContain("MCP is disabled");
  });

  it("keeps an explicit empty tool allowlist empty", async () => {
    const { definition } = await createServer({ exposedTools: [] });
    const result = await request(definition, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect((await result.json()).result.tools).toEqual([]);
  });

  it("rejects null JSON without crashing the HTTP server", async () => {
    const { definition } = await createServer();
    const result = await fetch(definition.uri.toString(), {
      method: "POST",
      headers: { ...definition.headers, "content-type": "application/json" },
      body: "null",
    });
    expect((await result.json()).error.code).toBe(-32600);
    const healthy = await request(definition, {
      jsonrpc: "2.0",
      id: 2,
      method: "ping",
    });
    expect((await healthy.json()).result).toEqual({});
  });
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
