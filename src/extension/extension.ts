import * as vscode from "vscode";
import { PreFlightPanel } from "./preflight-panel.js";

let panel: PreFlightPanel | undefined;

function getOrCreatePanel(extensionUri: vscode.Uri): PreFlightPanel {
  if (!panel) {
    panel = PreFlightPanel.create(extensionUri);
  }
  return panel;
}

export function activate(context: vscode.ExtensionContext): void {
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
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
}
