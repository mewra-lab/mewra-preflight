import * as vscode from "vscode";
import { generateNonce } from "./security/nonce.js";
import { WebviewMessageSchema } from "../shared/messages.js";
import type { ExtensionMessage } from "../shared/messages.js";
import type { PreFlightConfig } from "../shared/types.js";
import { computeGitDiff } from "../core/diff/git-diff.js";
import { runChecks } from "../core/checks/runner.js";
import { buildUniversalPack } from "../core/checks/packs/universal/index.js";
import { buildJsTsPack } from "../core/checks/packs/js-ts/index.js";
import { buildPRUrl } from "../core/pr/pr-launcher.js";

export class PreFlightPanel {
  static readonly viewType = "mewra-preflight.dashboard";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  static create(extensionUri: vscode.Uri): PreFlightPanel {
    const panel = vscode.window.createWebviewPanel(
      PreFlightPanel.viewType,
      "Mewra PreFlight",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
      },
    );
    return new PreFlightPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

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
    };
  }

  private _workspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  private async _handleWebviewMessage(raw: unknown): Promise<void> {
    const parsed = WebviewMessageSchema.safeParse(raw);
    if (!parsed.success) return;

    const msg = parsed.data;

    if (msg.type === "runPipeline") {
      await this._runPipeline();
    } else if (msg.type === "launchPR") {
      await this._launchPR();
    } else if (msg.type === "openFile") {
      const uri = vscode.Uri.file(msg.path);
      await vscode.window.showTextDocument(uri, {
        selection: new vscode.Range(
          Math.max(0, msg.line - 1),
          0,
          Math.max(0, msg.line - 1),
          0,
        ),
      });
    }
  }

  private async _runPipeline(): Promise<void> {
    const root = this._workspaceRoot();
    if (!root) {
      this._post({ type: "error", message: "No workspace folder open." });
      return;
    }

    const config = this._getConfig();

    let diff;
    try {
      diff = await computeGitDiff(root, config.targetBranch);
    } catch (e) {
      this._post({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to compute git diff.",
      });
      return;
    }

    const checks = [
      ...buildUniversalPack(),
      ...(config.enabledPacks.includes("js-ts") ? buildJsTsPack() : []),
    ];

    await runChecks(checks, diff, { workspaceRoot: root }, (snapshot) => {
      this._post({ type: "snapshot", payload: snapshot });
    });
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

    await vscode.env.openExternal(vscode.Uri.parse(prUrl.url));
  }

  private _post(message: ExtensionMessage): void {
    void this._panel.webview.postMessage(message);
  }

  runPipeline(): void {
    void this._runPipeline();
  }

  launchPR(): void {
    void this._launchPR();
  }

  reveal(): void {
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
      img-src ${webview.cspSource};
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
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}
