import * as vscode from "vscode";
import { PreFlightPanel } from "./preflight-panel.js";
import { CheckRegistry } from "../core/checks/registry.js";
import { PreFlightMcpHandler } from "../core/mcp/handler.js";
import {
  formatMcpClientConfig,
  type McpClient,
} from "../core/mcp/client-config.js";
import { PreFlightMcpServer } from "./mcp-server.js";
import { effectiveMcpConfig } from "../core/mcp/snapshot-policy.js";
import { buildUniversalPack } from "../core/checks/packs/universal/index.js";
import { buildJsTsPack } from "../core/checks/packs/js-ts/index.js";
import { buildGoPack } from "../core/checks/packs/go/index.js";
import { buildPythonPack } from "../core/checks/packs/python/index.js";
import { buildPhpPack } from "../core/checks/packs/php/index.js";
import type { CheckRunner } from "../core/checks/check-contract.js";
import { loadWorkspaceConfig } from "../core/config/workspace-config.js";

// MARK: - Types

export interface MewraPreFlightAPI {
  readonly apiVersion: 1;
  registerCheck(check: CheckRunner): vscode.Disposable;
  readonly mcpHandler: PreFlightMcpHandler;
}

// MARK: - State

const registry = new CheckRegistry();
const mcpHandler = new PreFlightMcpHandler(async () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const fileConfig = workspaceRoot
    ? await loadWorkspaceConfig(workspaceRoot)
    : null;

  return [
    ...buildUniversalPack(),
    ...buildJsTsPack(),
    ...buildGoPack(),
    ...buildPythonPack(),
    ...buildPhpPack(),
    ...registry.getConfiguredChecks(fileConfig?.contributedChecks),
  ];
});

let statusBarItem: vscode.StatusBarItem | undefined;

function updateStatusBar(
  status: "idle" | "running" | "pass" | "warning" | "fail",
): void {
  if (!statusBarItem) return;

  if (status === "running") {
    statusBarItem.text = "$(sync~spin) PreFlight: Running...";
    statusBarItem.backgroundColor = undefined;
    statusBarItem.tooltip = "Mewra PreFlight is running checks...";
  } else if (status === "pass") {
    statusBarItem.text = "$(check) PreFlight: Ready";
    statusBarItem.backgroundColor = undefined;
    statusBarItem.tooltip =
      "Mewra PreFlight: All checks passed. Ready to push!";
  } else if (status === "warning") {
    statusBarItem.text = "$(warning) PreFlight: Warnings";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBarItem.tooltip =
      "Mewra PreFlight: Completed with warnings. Click to inspect.";
  } else if (status === "fail") {
    statusBarItem.text = "$(error) PreFlight: Failed";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
    statusBarItem.tooltip =
      "Mewra PreFlight: Checks failed. Fix issues before pushing.";
  } else {
    statusBarItem.text = "$(rocket) PreFlight";
    statusBarItem.backgroundColor = undefined;
    statusBarItem.tooltip =
      "Mewra PreFlight — Open Pre-Push Dashboard (Alt+Shift+P)";
  }
}

// MARK: - Lifecycle

export function activate(context: vscode.ExtensionContext): MewraPreFlightAPI {
  const mcpOutput = vscode.window.createOutputChannel("Mewra PreFlight MCP");
  const getMcpConfig = async () => {
    const workspaceRoot =
      PreFlightPanel.currentPanel?.repositoryRoot ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return workspaceRoot
      ? effectiveMcpConfig(await loadWorkspaceConfig(workspaceRoot))
      : undefined;
  };
  const mcpServer = new PreFlightMcpServer(
    mcpHandler,
    getMcpConfig,
    context.extension.packageJSON.version as string,
  );
  const didChangeMcpDefinitions = new vscode.EventEmitter<void>();
  mcpHandler.setAuditLogger((message) => mcpOutput.appendLine(message));
  context.subscriptions.push(
    mcpOutput,
    didChangeMcpDefinitions,
    mcpServer,
    vscode.lm.registerMcpServerDefinitionProvider("mewra-preflight", {
      onDidChangeMcpServerDefinitions: didChangeMcpDefinitions.event,
      provideMcpServerDefinitions: async () => {
        const config = await getMcpConfig();
        const definition = mcpServer.definition;
        return config?.enabled === false || !definition ? [] : [definition];
      },
    }),
  );
  void mcpServer
    .start()
    .then(() => didChangeMcpDefinitions.fire())
    .catch((cause) =>
      mcpOutput.appendLine(
        `MCP server did not start: ${cause instanceof Error ? cause.message : "unknown error"}`,
      ),
    );

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10,
  );
  statusBarItem.name = "Mewra PreFlight";
  statusBarItem.command = "mewra-preflight.openDashboard";
  updateStatusBar("idle");
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mewra-preflight.copyMcpConnection",
      async () => {
        try {
          if (!vscode.workspace.isTrusted) {
            void vscode.window.showWarningMessage(
              "Trust this workspace before sharing its MCP connection.",
            );
            return;
          }
          if ((await getMcpConfig())?.enabled === false) {
            void vscode.window.showWarningMessage(
              "PreFlight MCP is disabled in .mewra-preflight.json.",
            );
            return;
          }
          await mcpServer.start();
          const definition = mcpServer.definition;
          if (!definition) throw new Error("PreFlight MCP is not ready.");
          const client = await vscode.window.showQuickPick(
            [
              {
                label: "Codex",
                description: "Private config.toml",
                client: "codex" as McpClient,
              },
              {
                label: "Claude Code",
                description: "Private .claude.json",
                client: "claude-code" as McpClient,
              },
              {
                label: "Cursor",
                description: "Private .cursor/mcp.json",
                client: "cursor" as McpClient,
              },
              {
                label: "VS Code / GitHub Copilot",
                description: "User MCP configuration",
                client: "vscode" as McpClient,
              },
              {
                label: "Other HTTP MCP client",
                description: "Connection URL and headers as JSON",
                client: "http" as McpClient,
              },
            ],
            {
              title: "Choose your AI agent / MCP client",
              placeHolder: "Local Streamable HTTP clients only",
            },
          );
          if (!client) return;
          const choice = await vscode.window.showWarningMessage(
            `Copy a session credential for local ${client.label} access? Keep it private, never commit it, and reconnect after reloading VS Code.`,
            { modal: true },
            "Copy connection",
          );
          if (choice !== "Copy connection") return;
          const config = formatMcpClientConfig(
            client.client,
            definition.uri.toString(),
            definition.headers,
          );
          await vscode.env.clipboard.writeText(config.configuration);
          void vscode.window.showInformationMessage(
            `${config.instructions} Connection copied; no file was changed.`,
          );
        } catch (cause) {
          void vscode.window.showErrorMessage(
            `Could not copy MCP connection: ${cause instanceof Error ? cause.message : "unknown error"}`,
          );
        }
      },
    ),
    vscode.commands.registerCommand("mewra-preflight.openDashboard", () => {
      const p = PreFlightPanel.createOrShow(
        context.extensionUri,
        registry,
        mcpHandler,
        (status) => {
          updateStatusBar(status);
        },
      );
      p.reveal();
      p.runPipeline();
    }),

    vscode.commands.registerCommand("mewra-preflight.runPipeline", () => {
      const p = PreFlightPanel.createOrShow(
        context.extensionUri,
        registry,
        mcpHandler,
        (status) => {
          updateStatusBar(status);
        },
      );
      p.reveal();
      p.runPipeline();
    }),

    vscode.commands.registerCommand("mewra-preflight.launchPR", () => {
      const p = PreFlightPanel.createOrShow(
        context.extensionUri,
        registry,
        mcpHandler,
        (status) => {
          updateStatusBar(status);
        },
      );
      p.launchPR();
    }),

    vscode.commands.registerCommand("mewra-preflight.openConfig", () => {
      const p = PreFlightPanel.createOrShow(
        context.extensionUri,
        registry,
        mcpHandler,
        (status) => {
          updateStatusBar(status);
        },
      );
      void p.openConfig();
    }),
  );

  return {
    apiVersion: 1,
    registerCheck(check: CheckRunner): vscode.Disposable {
      const disposable = registry.register(check);
      context.subscriptions.push(disposable);
      return disposable;
    },
    mcpHandler,
  };
}

export function deactivate(): void {
  PreFlightPanel.currentPanel?.dispose();
  statusBarItem?.dispose();
  statusBarItem = undefined;
  registry.clear();
}
