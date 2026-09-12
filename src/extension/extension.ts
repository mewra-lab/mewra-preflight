import * as vscode from "vscode";
import { PreFlightPanel } from "./preflight-panel.js";
import { CheckRegistry } from "../core/checks/registry.js";
import { PreFlightMcpHandler } from "../core/mcp/handler.js";
import { buildUniversalPack } from "../core/checks/packs/universal/index.js";
import { buildJsTsPack } from "../core/checks/packs/js-ts/index.js";
import type { CheckRunner } from "../core/checks/check-contract.js";

// MARK: - Types

export interface MewraPreFlightAPI {
  registerCheck(check: CheckRunner): vscode.Disposable;
  readonly mcpHandler: PreFlightMcpHandler;
}

// MARK: - State

const registry = new CheckRegistry();
const mcpHandler = new PreFlightMcpHandler(() => [
  ...buildUniversalPack(),
  ...buildJsTsPack(),
  ...registry.getContributedChecks(),
]);

let panel: PreFlightPanel | undefined;

function getOrCreatePanel(extensionUri: vscode.Uri): PreFlightPanel {
  if (!panel) {
    panel = PreFlightPanel.create(extensionUri, registry, mcpHandler);
  }
  return panel;
}

// MARK: - Lifecycle

export function activate(context: vscode.ExtensionContext): MewraPreFlightAPI {
  context.subscriptions.push(
    vscode.commands.registerCommand("mewra-preflight.openDashboard", () => {
      getOrCreatePanel(context.extensionUri).reveal();
    }),

    vscode.commands.registerCommand("mewra-preflight.runPipeline", () => {
      getOrCreatePanel(context.extensionUri).runPipeline();
    }),

    vscode.commands.registerCommand("mewra-preflight.launchPR", () => {
      getOrCreatePanel(context.extensionUri).launchPR();
    }),
  );

  return {
    registerCheck(check: CheckRunner): vscode.Disposable {
      const disposable = registry.register(check);
      context.subscriptions.push(disposable);
      return disposable;
    },
    mcpHandler,
  };
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
  registry.clear();
}
