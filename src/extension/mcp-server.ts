import { createServer, type IncomingMessage, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { McpConfig } from "../shared/types.js";
import { PreFlightMcpHandler } from "../core/mcp/handler.js";

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

type McpTool =
  | "get_preflight_status"
  | "get_check_findings"
  | "run_check"
  | "mark_manual_check";

const DEFAULT_TOOLS: McpTool[] = [
  "get_preflight_status",
  "get_check_findings",
  "run_check",
];

function response(result: unknown, id: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function error(
  code: number,
  message: string,
  id: unknown,
): Record<string, unknown> {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isTool(value: unknown): value is McpTool {
  return (
    value === "get_preflight_status" ||
    value === "get_check_findings" ||
    value === "run_check" ||
    value === "mark_manual_check"
  );
}

function exposedTools(config: McpConfig | undefined): McpTool[] {
  const configured = config?.exposedTools?.filter(isTool);
  return configured?.length ? configured : DEFAULT_TOOLS;
}

function toolDefinition(name: McpTool): Record<string, unknown> {
  if (name === "get_preflight_status") {
    return {
      name,
      description: "Return the latest diff-scoped Mewra PreFlight snapshot.",
      inputSchema: { type: "object", additionalProperties: false },
      annotations: { readOnlyHint: true },
    };
  }
  if (name === "get_check_findings") {
    return {
      name,
      description:
        "Return line-level findings for one registered PreFlight check.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["checkId"],
        properties: {
          checkId: { type: "string", minLength: 1, maxLength: 256 },
        },
      },
      annotations: { readOnlyHint: true },
    };
  }
  if (name === "run_check") {
    return {
      name,
      description:
        "Re-run exactly one check from the latest PreFlight pipeline.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["checkId"],
        properties: {
          checkId: { type: "string", minLength: 1, maxLength: 256 },
        },
      },
    };
  }
  return {
    name,
    description: "Mark an explicitly agent-checkable manual PreFlight item.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["checkId", "done"],
      properties: {
        checkId: { type: "string", minLength: 1, maxLength: 256 },
        done: { type: "boolean" },
      },
    },
  };
}

function textResult(value: unknown, isError = false): Record<string, unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  };
}

async function requestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 1_000_000) throw new Error("MCP request exceeds 1 MB.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export class PreFlightMcpServer implements vscode.Disposable {
  private readonly _token = randomBytes(32).toString("base64url");
  private _server: Server | undefined;
  private _port: number | undefined;

  constructor(
    private readonly _handler: PreFlightMcpHandler,
    private readonly _getConfig: () => Promise<McpConfig | undefined>,
    private readonly _version: string,
  ) {}

  get ready(): boolean {
    return this._port !== undefined;
  }

  get definition(): vscode.McpHttpServerDefinition | undefined {
    if (!this._port) return undefined;
    return new vscode.McpHttpServerDefinition(
      "Mewra PreFlight",
      vscode.Uri.parse(`http://127.0.0.1:${this._port}/mcp`),
      { Authorization: `Bearer ${this._token}` },
      this._version,
    );
  }

  async start(): Promise<void> {
    if (this._server) return;
    this._server = createServer((request, res) => {
      void this._handle(request, res);
    });
    await new Promise<void>((resolve, reject) => {
      this._server?.once("error", reject);
      this._server?.listen(0, "127.0.0.1", () => {
        this._server?.off("error", reject);
        const address = this._server?.address();
        if (!address || typeof address === "string") {
          reject(new Error("MCP server did not receive a loopback port."));
          return;
        }
        this._port = address.port;
        resolve();
      });
    });
  }

  dispose(): void {
    this._server?.close();
    this._server = undefined;
    this._port = undefined;
  }

  private async _handle(
    request: IncomingMessage,
    res: import("node:http").ServerResponse,
  ): Promise<void> {
    const host = request.headers.host;
    const authorization = request.headers.authorization;
    if (
      host !== `127.0.0.1:${this._port}` ||
      authorization !== `Bearer ${this._token}`
    ) {
      res.writeHead(403).end();
      return;
    }
    if (request.method !== "POST" || request.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }

    let body: JsonRpcRequest;
    try {
      body = JSON.parse(await requestBody(request)) as JsonRpcRequest;
    } catch {
      this._write(res, error(-32700, "Invalid JSON-RPC request.", null));
      return;
    }
    if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
      this._write(res, error(-32600, "Invalid JSON-RPC request.", body.id));
      return;
    }

    try {
      const result = await this._dispatch(body.method, body.params);
      if (body.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      this._write(res, response(result, body.id));
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "MCP request failed.";
      this._write(res, error(-32000, message, body.id));
    }
  }

  private _write(
    res: import("node:http").ServerResponse,
    payload: Record<string, unknown>,
  ): void {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  }

  private async _dispatch(method: string, params: unknown): Promise<unknown> {
    const config = await this._getConfig();
    const tools = exposedTools(config);
    if (method === "initialize") {
      return {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "mewra-preflight", version: this._version },
      };
    }
    if (method === "ping") return {};
    if (method === "notifications/initialized") return {};
    if (method === "tools/list") return { tools: tools.map(toolDefinition) };
    if (method === "resources/list") {
      return {
        resources: [
          { uri: "preflight://dashboard", name: "PreFlight dashboard" },
          { uri: "preflight://pr-draft", name: "PreFlight PR draft" },
        ],
      };
    }
    if (method === "resources/read") {
      const uri = object(params)?.uri;
      if (uri !== "preflight://dashboard" && uri !== "preflight://pr-draft") {
        throw new Error("Unknown PreFlight resource.");
      }
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(this._handler.getResource(uri)),
          },
        ],
      };
    }
    if (method !== "tools/call") throw new Error("Method not found.");

    const request = object(params);
    const name = request?.name;
    const args = object(request?.arguments) ?? {};
    if (!isTool(name) || !tools.includes(name)) {
      throw new Error("MCP tool is not enabled.");
    }
    if (name === "get_preflight_status") {
      return textResult(this._handler.get_preflight_status());
    }
    const checkId = args.checkId;
    if (
      typeof checkId !== "string" ||
      checkId.length === 0 ||
      checkId.length > 256
    ) {
      throw new Error(
        "checkId must be a non-empty string up to 256 characters.",
      );
    }
    if (name === "get_check_findings") {
      return textResult(this._handler.get_check_findings(checkId));
    }
    if (name === "run_check") {
      return textResult(await this._handler.runRegisteredCheck(checkId));
    }
    if (typeof args.done !== "boolean")
      throw new Error("done must be a boolean.");
    this._handler.markAgentManualCheck(
      checkId,
      args.done,
      config?.agentCheckableManualChecks ?? [],
    );
    return textResult({ checkId, done: args.done });
  }
}
