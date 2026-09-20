import * as vscode from "vscode";
import { PreFlightPanel } from "./preflight-panel.js";
import { CheckRegistry } from "../core/checks/registry.js";
import { PreFlightMcpHandler } from "../core/mcp/handler.js";
import { PreFlightMcpServer } from "./mcp-server.js";
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
  readonly capabilities: { readonly resultActions: true };
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
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return workspaceRoot
      ? (await loadWorkspaceConfig(workspaceRoot))?.mcp
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
    capabilities: { resultActions: true },
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
