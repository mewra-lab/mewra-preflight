import * as vscode from "vscode";
import { PreFlightPanel } from "./preflight-panel.js";
import { CheckRegistry } from "../core/checks/registry.js";
import { PreFlightMcpHandler } from "../core/mcp/handler.js";
import { buildUniversalPack } from "../core/checks/packs/universal/index.js";
import { buildJsTsPack } from "../core/checks/packs/js-ts/index.js";
import { buildGoPack } from "../core/checks/packs/go/index.js";
import { buildPythonPack } from "../core/checks/packs/python/index.js";
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
  ...buildGoPack(),
  ...buildPythonPack(),
  ...registry.getContributedChecks(),
]);

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

  const lmApi = (
    vscode as unknown as {
      lm?: {
        registerMcpServerDefinitionProvider?: (
          id: string,
          provider: unknown,
        ) => vscode.Disposable;
      };
    }
  ).lm;

  if (typeof lmApi?.registerMcpServerDefinitionProvider === "function") {
    const mcpDisposable = lmApi.registerMcpServerDefinitionProvider(
      "mewra-preflight",
      {
        provideMcpServerDefinitions() {
          return [];
        },
      },
    );
    context.subscriptions.push(mcpDisposable);
  }

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
  PreFlightPanel.currentPanel?.dispose();
  statusBarItem?.dispose();
  statusBarItem = undefined;
  registry.clear();
}
