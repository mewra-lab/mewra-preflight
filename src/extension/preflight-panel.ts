import * as vscode from "vscode";
import { resolve, isAbsolute } from "node:path";
import { access } from "node:fs/promises";
import { generateNonce } from "./security/nonce.js";
import { WebviewMessageSchema } from "../shared/messages.js";
import type { ExtensionMessage } from "../shared/messages.js";
import type {
  PreFlightConfig,
  PreFlightSnapshot,
  DiffScope,
} from "../shared/types.js";
import { computeGitDiff, listGitBranches } from "../core/diff/git-diff.js";
import { deriveOverallStatus, runChecks } from "../core/checks/runner.js";
import { createPreFlightContext } from "../core/checks/context.js";
import { CheckRegistry } from "../core/checks/registry.js";
import { PreFlightMcpHandler } from "../core/mcp/handler.js";
import { detectEcosystem } from "../core/ecosystem/detect-ecosystem.js";
import { buildUniversalPack } from "../core/checks/packs/universal/index.js";
import { buildJsTsPack } from "../core/checks/packs/js-ts/index.js";
import { buildPRUrl } from "../core/pr/pr-launcher.js";
import {
  loadWorkspaceConfig,
  mergeWorkspaceConfig,
} from "../core/config/workspace-config.js";
import { evaluateManualChecks } from "../core/checks/manual-evaluator.js";

// MARK: - Types

export type StatusChangeCallback = (
  status: "idle" | "running" | "pass" | "warning" | "fail",
) => void;

// MARK: - Helpers

async function detectJsPackageManager(root: string): Promise<string> {
  const check = async (file: string): Promise<boolean> => {
    try {
      await access(resolve(root, file));
      return true;
    } catch {
      return false;
    }
  };

  if (await check("pnpm-lock.yaml")) return "pnpm add -D";
  if (await check("yarn.lock")) return "yarn add -D";
  if ((await check("bun.lockb")) || (await check("bun.lock")))
    return "bun add -d";
  return "npm install -D";
}

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
  private _selectedTargetBranch: string | null = null;
  private _manualCheckStates: Map<string, boolean> = new Map();
  private _lastSnapshot: PreFlightSnapshot | undefined;

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

    const watcher = vscode.workspace.createFileSystemWatcher(
      "**/.mewra-preflight.json",
    );
    watcher.onDidChange(
      () => void this._runPipeline(),
      undefined,
      this._disposables,
    );
    watcher.onDidCreate(
      () => void this._runPipeline(),
      undefined,
      this._disposables,
    );
    watcher.onDidDelete(
      () => void this._runPipeline(),
      undefined,
      this._disposables,
    );
    this._disposables.push(watcher);

    this._panel.onDidDispose(
      () => this.dispose(),
      undefined,
      this._disposables,
    );
  }

  private _getConfig(
    fileConfig: ReturnType<typeof loadWorkspaceConfig> extends Promise<infer U>
      ? U
      : null = null,
  ): PreFlightConfig {
    const cfg = vscode.workspace.getConfiguration("mewraPreflight");
    const base: PreFlightConfig = {
      targetBranch:
        this._selectedTargetBranch ?? cfg.get<string>("targetBranch") ?? "main",
      enabledPacks: cfg.get<string[]>("enabledPacks") ?? ["universal", "js-ts"],
      blockingOnWarnings: cfg.get<boolean>("blockingOnWarnings") ?? false,
      gitHost: cfg.get<"github" | "gitlab">("gitHost") ?? "github",
      diffScope: cfg.get<DiffScope>("diffScope") ?? "branch",
    };
    return mergeWorkspaceConfig(base, fileConfig);
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
    } else if (msg.type === "quickFix") {
      await this._handleQuickFix(msg.checkId, msg.file);
    } else if (msg.type === "selectTargetBranch") {
      await this._handleSelectTargetBranch();
    } else if (msg.type === "launchPR") {
      await this._launchPR();
    } else if (msg.type === "markManualCheck") {
      this._manualCheckStates.set(msg.checkId, msg.done);
      if (this._lastSnapshot) {
        const updatedManual = this._lastSnapshot.manualChecks.map((m) =>
          m.id === msg.checkId ? { ...m, checked: msg.done } : m,
        );
        const updatedSnapshot: PreFlightSnapshot = {
          ...this._lastSnapshot,
          manualChecks: updatedManual,
          overallStatus: deriveOverallStatus(
            this._lastSnapshot.checks,
            updatedManual,
          ),
        };
        this._lastSnapshot = updatedSnapshot;
        this._post({ type: "snapshot", payload: updatedSnapshot });
        this._mcpHandler.updateSnapshot(updatedSnapshot);
        const overall = updatedSnapshot.overallStatus;
        if (overall === "pass" || overall === "warning" || overall === "fail") {
          this._onStatusChange?.(overall);
        }
      }
    } else if (msg.type === "installTool") {
      await this._handleInstallTool(msg.tool, msg.pack);
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
        void vscode.window.showErrorMessage(`Could not open file: ${msg.path}`);
      }
    }
  }

  private async _handleInstallTool(
    toolName: string,
    pack?: string,
  ): Promise<void> {
    const root = this._workspaceRoot();
    if (!root) return;

    let cmd: string;
    if (pack === "python") {
      cmd = `pip install ${toolName}`;
    } else {
      const pkg = toolName === "tsc" ? "typescript" : toolName;
      const pm = await detectJsPackageManager(root);
      cmd = `${pm} ${pkg}`;
    }

    const terminal = vscode.window.createTerminal({
      name: "Mewra PreFlight: Install",
      cwd: root,
    });
    terminal.show(true);
    terminal.sendText(cmd);
  }

  private async _runPipeline(): Promise<void> {
    const root = this._workspaceRoot();
    if (!root) {
      this._post({ type: "error", message: "No workspace folder open." });
      this._onStatusChange?.("idle");
      return;
    }

    try {
      await vscode.workspace.saveAll(false);
    } catch {}

    this._onStatusChange?.("running");

    const fileConfig = await loadWorkspaceConfig(root);
    const config = this._getConfig(fileConfig);

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

    const manualChecks = evaluateManualChecks(
      config.manualChecklist ?? [],
      diff.changedFiles,
      this._manualCheckStates,
    );

    const detectedEcosystem = await detectEcosystem(root);
    const shouldEnableJsTs =
      config.enabledPacks.includes("js-ts") || detectedEcosystem === "js-ts";

    const checks = [
      ...buildUniversalPack(config.largeFileThresholdMb),
      ...(shouldEnableJsTs ? buildJsTsPack() : []),
      ...this._registry.getContributedChecks(),
    ];

    const context = createPreFlightContext(root);

    const finalSnapshot = await runChecks(
      checks,
      diff,
      context,
      (snapshot) => {
        this._post({ type: "snapshot", payload: snapshot });
      },
      manualChecks,
    );

    this._lastSnapshot = finalSnapshot;
    this._mcpHandler.updateSnapshot(finalSnapshot);

    const overall = finalSnapshot.overallStatus;
    if (overall === "pass" || overall === "warning" || overall === "fail") {
      this._onStatusChange?.(overall);
    } else {
      this._onStatusChange?.("idle");
    }
  }

  private async _handleQuickFix(checkId: string, file?: string): Promise<void> {
    const root = this._workspaceRoot();
    if (!root) return;

    try {
      await vscode.workspace.saveAll(false);
      const context = createPreFlightContext(root);

      if (checkId === "js-ts:prettier") {
        const tool = await context.resolveTool("prettier");
        if (!tool) {
          this._post({ type: "quickFixFailed", checkId, file });
          void vscode.window.showErrorMessage("Prettier is not installed.");
          return;
        }

        const args = file ? ["--write", file] : ["--write", "."];
        const res = await context.runCommand(tool, args);
        if (res.code === 0) {
          void vscode.window.showInformationMessage(
            file
              ? `Formatted ${file} with Prettier.`
              : "Formatted files with Prettier.",
          );
        } else {
          this._post({ type: "quickFixFailed", checkId, file });
          void vscode.window.showWarningMessage(
            res.stderr.trim() ||
              `Prettier failed to format ${file ?? "files"}.`,
          );
        }
        await vscode.workspace.saveAll(false);
        await this._runPipeline();
      } else if (checkId === "js-ts:eslint") {
        const tool = await context.resolveTool("eslint");
        if (!tool) {
          this._post({ type: "quickFixFailed", checkId, file });
          void vscode.window.showErrorMessage("ESLint is not installed.");
          return;
        }

        const args = file ? ["--fix", file] : ["--fix", "."];
        const res = await context.runCommand(tool, args);
        if (res.code === 0) {
          void vscode.window.showInformationMessage(
            file ? `Fixed ${file} with ESLint.` : "Fixed files with ESLint.",
          );
        } else {
          this._post({ type: "quickFixFailed", checkId, file });
          void vscode.window.showWarningMessage(
            res.stderr.trim() || `ESLint failed to fix ${file ?? "files"}.`,
          );
        }
        await vscode.workspace.saveAll(false);
        await this._runPipeline();
      }
    } catch {
      this._post({ type: "quickFixFailed", checkId, file });
    } finally {
      this._post({ type: "quickFixDone", checkId, file });
    }
  }

  private async _handleSelectTargetBranch(): Promise<void> {
    const root = this._workspaceRoot();
    if (!root) return;

    const branches = await listGitBranches(root);
    if (branches.length === 0) {
      void vscode.window.showInformationMessage("No git branches found.");
      return;
    }

    const current =
      this._selectedTargetBranch ?? this._getConfig().targetBranch;
    const items: vscode.QuickPickItem[] = branches.map((b) => {
      const item: vscode.QuickPickItem = { label: b };
      if (b === current) {
        item.description = "(current target)";
      }
      return item;
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select target branch to diff against",
    });

    if (selected && selected.label !== current) {
      this._selectedTargetBranch = selected.label;
      await this._runPipeline();
    }
  }

  private async _launchPR(): Promise<void> {
    const root = this._workspaceRoot();
    if (!root) return;

    const fileConfig = await loadWorkspaceConfig(root);
    const config = this._getConfig(fileConfig);
    const prUrl = await buildPRUrl(root, config, this._lastSnapshot);

    if (!prUrl) {
      void vscode.window.showInformationMessage(
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
