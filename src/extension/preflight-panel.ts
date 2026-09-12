import * as vscode from "vscode";
import { resolve, isAbsolute } from "node:path";
import { generateNonce } from "./security/nonce.js";
import { WebviewMessageSchema } from "../shared/messages.js";
import type { ExtensionMessage } from "../shared/messages.js";
import type { PreFlightConfig, DiffScope } from "../shared/types.js";
import { computeGitDiff } from "../core/diff/git-diff.js";
import { runChecks } from "../core/checks/runner.js";
import { createPreFlightContext } from "../core/checks/context.js";
import { CheckRegistry } from "../core/checks/registry.js";
import { PreFlightMcpHandler } from "../core/mcp/handler.js";
import { detectEcosystem } from "../core/ecosystem/detect-ecosystem.js";
import { buildUniversalPack } from "../core/checks/packs/universal/index.js";
import { buildJsTsPack } from "../core/checks/packs/js-ts/index.js";
import { buildPRUrl } from "../core/pr/pr-launcher.js";

// MARK: - Types

export type StatusChangeCallback = (
  status: "idle" | "running" | "pass" | "warning" | "fail",
) => void;

// MARK: - Panel Class

export class PreFlightPanel {
  static readonly viewType = "mewra-preflight.dashboard";
  static currentPanel: PreFlightPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _registry: CheckRegistry;
  private readonly _mcpHandler: PreFlightMcpHandler;
  private readonly _onStatusChange: StatusChangeCallback | undefined;
  private _disposables: vscode.Disposable[] = [];
  private _isDisposed = false;
  private _selectedScope: DiffScope | undefined;

  static createOrShow(
    extensionUri: vscode.Uri,
    registry: CheckRegistry,
    mcpHandler: PreFlightMcpHandler,
    onStatusChange?: StatusChangeCallback,
  ): PreFlightPanel {
    if (
      PreFlightPanel.currentPanel &&
      !PreFlightPanel.currentPanel._isDisposed
    ) {
      PreFlightPanel.currentPanel.reveal();
      return PreFlightPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      PreFlightPanel.viewType,
      "Mewra PreFlight",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist"),
          vscode.Uri.joinPath(extensionUri, "assets"),
        ],
      },
    );

    PreFlightPanel.currentPanel = new PreFlightPanel(
      panel,
      extensionUri,
      registry,
      mcpHandler,
      onStatusChange,
    );

    return PreFlightPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    registry: CheckRegistry,
    mcpHandler: PreFlightMcpHandler,
    onStatusChange?: StatusChangeCallback,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._registry = registry;
    this._mcpHandler = mcpHandler;
    this._onStatusChange = onStatusChange;

    this._panel.webview.html = this._buildHtml();

    this._panel.webview.onDidReceiveMessage(
      (raw: unknown) => void this._handleWebviewMessage(raw),
      undefined,
      this._disposables,
    );

    this._panel.onDidDispose(
      () => this.dispose(),
      undefined,
      this._disposables,
    );
  }

  private _getConfig(): PreFlightConfig {
    const cfg = vscode.workspace.getConfiguration("mewraPreflight");
    return {
      targetBranch: cfg.get<string>("targetBranch") ?? "main",
      enabledPacks: cfg.get<string[]>("enabledPacks") ?? ["universal", "js-ts"],
      blockingOnWarnings: cfg.get<boolean>("blockingOnWarnings") ?? false,
      gitHost: cfg.get<"github" | "gitlab">("gitHost") ?? "github",
      diffScope: cfg.get<DiffScope>("diffScope") ?? "branch",
    };
  }

  private _workspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  private async _handleWebviewMessage(raw: unknown): Promise<void> {
    const parsed = WebviewMessageSchema.safeParse(raw);
    if (!parsed.success) return;

    const msg = parsed.data;

    if (msg.type === "ready") {
      await this._runPipeline();
    } else if (msg.type === "runPipeline") {
      if (msg.scope) this._selectedScope = msg.scope;
      await this._runPipeline();
    } else if (msg.type === "changeDiffScope") {
      this._selectedScope = msg.scope;
      await this._runPipeline();
    } else if (msg.type === "launchPR") {
      await this._launchPR();
    } else if (msg.type === "openFile") {
      const root = this._workspaceRoot();
      if (!root || !msg.path || msg.path === "(diff)") return;

      const fullPath = isAbsolute(msg.path)
        ? msg.path
        : resolve(root, msg.path);

      try {
        const uri = vscode.Uri.file(fullPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const targetLine = Math.max(0, (msg.line > 0 ? msg.line : 1) - 1);
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.One,
          selection: new vscode.Range(targetLine, 0, targetLine, 0),
          preserveFocus: false,
          preview: false,
        });
      } catch {
        await vscode.window.showErrorMessage(
          `Could not open file: ${msg.path}`,
        );
      }
    }
  }

  private async _runPipeline(): Promise<void> {
    const root = this._workspaceRoot();
    if (!root) {
      this._post({ type: "error", message: "No workspace folder open." });
      this._onStatusChange?.("idle");
      return;
    }

    this._onStatusChange?.("running");

    const config = this._getConfig();

    const scope = this._selectedScope ?? config.diffScope;
    let diff;
    try {
      diff = await computeGitDiff(root, config.targetBranch, scope);
    } catch (e) {
      this._post({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to compute git diff.",
      });
      this._onStatusChange?.("fail");
      return;
    }

    const detectedEcosystem = await detectEcosystem(root);
    const shouldEnableJsTs =
      config.enabledPacks.includes("js-ts") || detectedEcosystem === "js-ts";

    const checks = [
      ...buildUniversalPack(),
      ...(shouldEnableJsTs ? buildJsTsPack() : []),
      ...this._registry.getContributedChecks(),
    ];

    const context = createPreFlightContext(root);

    const finalSnapshot = await runChecks(checks, diff, context, (snapshot) => {
      this._post({ type: "snapshot", payload: snapshot });
    });

    this._mcpHandler.updateSnapshot(finalSnapshot);

    const overall = finalSnapshot.overallStatus;
    if (overall === "pass" || overall === "warning" || overall === "fail") {
      this._onStatusChange?.(overall);
    } else {
      this._onStatusChange?.("idle");
    }
  }

  private async _launchPR(): Promise<void> {
    const root = this._workspaceRoot();
    if (!root) return;

    const config = this._getConfig();
    const prUrl = await buildPRUrl(root, config);

    if (!prUrl) {
      await vscode.window.showInformationMessage(
        "Could not determine PR URL. Are you on a feature branch with a remote?",
      );
      return;
    }

    this._mcpHandler.setDraftPR({
      title: prUrl.title,
      body: prUrl.body,
    });

    await vscode.env.openExternal(vscode.Uri.parse(prUrl.url));
  }

  private _post(message: ExtensionMessage): void {
    if (this._isDisposed) return;
    void this._panel.webview.postMessage(message);
  }

  runPipeline(): void {
    void this._runPipeline();
  }

  launchPR(): void {
    void this._launchPR();
  }

  reveal(): void {
    if (this._isDisposed) return;
    this._panel.reveal(vscode.ViewColumn.Beside);
  }

  private _buildHtml(): string {
    const nonce = generateNonce();
    const webview = this._panel.webview;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview", "index.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "dist",
        "webview",
        "assets",
        "styles.css",
      ),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      style-src ${webview.cspSource} 'nonce-${nonce}';
      img-src ${webview.cspSource} data:;
      script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Mewra PreFlight</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    if (PreFlightPanel.currentPanel === this) {
      PreFlightPanel.currentPanel = undefined;
    }

    this._onStatusChange?.("idle");

    for (const d of this._disposables) d.dispose();
    this._disposables = [];

    try {
      this._panel.dispose();
    } catch {}
  }
}
