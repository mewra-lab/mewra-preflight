import * as vscode from "vscode";
import { resolve, isAbsolute, relative } from "node:path";
import { access, readFile, writeFile } from "node:fs/promises";
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
import { detectActiveEcosystems } from "../core/ecosystem/detect-ecosystem.js";
import { buildUniversalPack } from "../core/checks/packs/universal/index.js";
import { buildJsTsPack } from "../core/checks/packs/js-ts/index.js";
import { buildGoPack } from "../core/checks/packs/go/index.js";
import { buildPythonPack } from "../core/checks/packs/python/index.js";
import { buildPhpPack } from "../core/checks/packs/php/index.js";
import { buildPouncePack } from "../core/checks/packs/pounce/index.js";
import { buildOrmCostSentryPack } from "../core/checks/packs/orm-cost-sentry/index.js";
import { buildStyleGuardianPack } from "../core/checks/packs/style-guardian/index.js";
import { buildCustomChecks } from "../core/checks/packs/custom/custom-runner.js";
import {
  buildPRUrl,
  createGitHubPullRequest,
  createGitLabMergeRequest,
} from "../core/pr/pr-launcher.js";
import {
  loadWorkspaceConfig,
  mergeWorkspaceConfig,
} from "../core/config/workspace-config.js";
import { evaluateManualChecks } from "../core/checks/manual-evaluator.js";
import {
  parsePreflightIgnore,
  filterDiffByPreflightIgnore,
} from "../core/config/preflight-ignore.js";

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

type ToolInstall =
  | { kind: "js"; packageName: string }
  | { kind: "python"; packageName: string }
  | { kind: "php"; packageName: string };

const INSTALLABLE_CHECKS: Record<string, ToolInstall> = {
  "js-ts:prettier": { kind: "js", packageName: "prettier" },
  "js-ts:eslint": { kind: "js", packageName: "eslint" },
  "js-ts:tsc": { kind: "js", packageName: "typescript" },
  "python:format": { kind: "python", packageName: "ruff" },
  "python:lint": { kind: "python", packageName: "ruff" },
  "python:mypy": { kind: "python", packageName: "mypy" },
  "php:cs-fixer": {
    kind: "php",
    packageName: "friendsofphp/php-cs-fixer",
  },
  "php:analyze": { kind: "php", packageName: "phpstan/phpstan" },
};

function isWorkspacePath(workspaceRoot: string, candidate: string): boolean {
  const path = relative(workspaceRoot, candidate);
  return (
    path !== "" && path !== ".." && !path.startsWith("..") && !isAbsolute(path)
  );
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
      targetBranch: cfg.get<string>("targetBranch") ?? "main",
      enabledPacks: cfg.get<string[]>("enabledPacks") ?? [
        "universal",
        "js-ts",
        "go",
        "python",
        "php",
        "pounce",
        "orm-cost-sentry",
        "style-guardian",
      ],
      blockingOnWarnings: cfg.get<boolean>("blockingOnWarnings") ?? false,
      gitHost: cfg.get<"github" | "gitlab">("gitHost") ?? "github",
      diffScope: cfg.get<DiffScope>("diffScope") ?? "branch",
    };
    const merged = mergeWorkspaceConfig(base, fileConfig);
    if (this._selectedTargetBranch) {
      merged.targetBranch = this._selectedTargetBranch;
    }
    return merged;
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
      await this._handleInstallTool(msg.checkId);
    } else if (msg.type === "configureCheck") {
      await this._handleConfigureCheck(msg.checkId);
    } else if (msg.type === "openFile") {
      const root = this._workspaceRoot();
      if (!root || !msg.path || msg.path === "(diff)") return;

      const fullPath = isAbsolute(msg.path)
        ? msg.path
        : resolve(root, msg.path);
      if (!isWorkspacePath(root, fullPath)) return;

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
    } else if (msg.type === "openExternal") {
      const uri = vscode.Uri.parse(msg.url);
      const advisoryUrls = this._lastSnapshot?.checks.flatMap((check) =>
        check.result.findings
          .map((finding) => finding.metadata?.advisoryUrl)
          .filter((url): url is string => url !== undefined),
      );
      if (uri.scheme === "https" && advisoryUrls?.includes(msg.url)) {
        await vscode.env.openExternal(uri);
      }
    } else if (msg.type === "openConfig") {
      await this.openConfig();
    }
  }

  private async _handleInstallTool(checkId: string): Promise<void> {
    const root = this._workspaceRoot();
    if (!root) return;
    const definition = this._lastSnapshot?.checks.find(
      (check) => check.definition.id === checkId,
    )?.definition;
    const install =
      definition?.installable === false
        ? undefined
        : INSTALLABLE_CHECKS[checkId];
    if (!install) return;

    let cmd: string;
    if (install.kind === "python") {
      cmd = `pip install ${install.packageName}`;
    } else if (install.kind === "php") {
      cmd = `composer require --dev ${install.packageName}`;
    } else {
      const pm = await detectJsPackageManager(root);
      cmd = `${pm} ${install.packageName}`;
    }

    const terminal = vscode.window.createTerminal({
      name: "Mewra PreFlight: Install",
      cwd: root,
    });
    terminal.show(true);
    terminal.sendText(cmd);
  }

  private async _handleConfigureCheck(checkId: string): Promise<void> {
    const setupCommand = this._lastSnapshot?.checks.find(
      (check) => check.definition.id === checkId,
    )?.definition.setupCommand;
    if (!setupCommand) return;

    await vscode.commands.executeCommand(setupCommand);
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

    const activeEcosystems = await detectActiveEcosystems(root, diff);

    const isPackActive = (
      packId: "js-ts" | "go" | "python" | "php",
    ): boolean => {
      const fileSetting = fileConfig?.ecosystems?.[packId]?.enabled;
      if (typeof fileSetting === "boolean") {
        return fileSetting;
      }
      if (activeEcosystems.length > 0) {
        return activeEcosystems.includes(packId);
      }
      return config.enabledPacks.includes(packId);
    };

    const shouldEnableJsTs = isPackActive("js-ts");
    const shouldEnableGo = isPackActive("go");
    const shouldEnablePython = isPackActive("python");
    const shouldEnablePhp = isPackActive("php");

    const customChecks = await buildCustomChecks(config, root);

    const hasPounceCompanion =
      vscode.extensions.getExtension("mewra.mewra-pounce") !== undefined;
    const isPounceExplicitlyDisabled =
      fileConfig?.ecosystems?.["pounce"]?.enabled === false;
    const shouldEnablePounce =
      !isPounceExplicitlyDisabled &&
      (hasPounceCompanion ||
        fileConfig?.ecosystems?.["pounce"]?.enabled === true ||
        config.enabledPacks.includes("pounce"));

    const shouldEnableFirstPartyPack = (packId: string): boolean => {
      const fileSetting = fileConfig?.ecosystems?.[packId]?.enabled;
      return (
        fileSetting !== false &&
        (fileSetting === true || config.enabledPacks.includes(packId))
      );
    };

    const checks = [
      ...buildUniversalPack(
        config.universalChecks ?? config.largeFileThresholdMb,
      ),
      ...(shouldEnableJsTs ? buildJsTsPack() : []),
      ...(shouldEnableGo ? buildGoPack() : []),
      ...(shouldEnablePython ? buildPythonPack() : []),
      ...(shouldEnablePhp ? buildPhpPack() : []),
      ...(shouldEnablePounce ? buildPouncePack() : []),
      ...(shouldEnableFirstPartyPack("orm-cost-sentry")
        ? buildOrmCostSentryPack()
        : []),
      ...(shouldEnableFirstPartyPack("style-guardian")
        ? buildStyleGuardianPack()
        : []),
      ...customChecks,
      ...this._registry.getConfiguredChecks(fileConfig?.contributedChecks),
    ];

    let ignoreRules;
    try {
      const ignoreContent = await readFile(
        resolve(root, ".preflightignore"),
        "utf-8",
      );
      ignoreRules = parsePreflightIgnore(ignoreContent);
    } catch {
      ignoreRules = undefined;
    }

    const filteredDiff = ignoreRules
      ? filterDiffByPreflightIgnore(diff, ignoreRules)
      : diff;
    const manualChecks = evaluateManualChecks(
      config.manualChecklist ?? [],
      filteredDiff.changedFiles,
      this._manualCheckStates,
    );

    const context = createPreFlightContext(root);

    const finalSnapshot = await runChecks(
      checks,
      filteredDiff,
      context,
      (snapshot) => {
        this._post({ type: "snapshot", payload: snapshot });
      },
      manualChecks,
      ignoreRules,
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
      } else if (checkId === "go:gofmt") {
        const tool = await context.resolveTool("gofmt");
        if (!tool) {
          this._post({ type: "quickFixFailed", checkId, file });
          void vscode.window.showErrorMessage(
            "gofmt is not found in Go toolchain or PATH.",
          );
          return;
        }

        const args = file ? ["-w", file] : ["-w", "."];
        const res = await context.runCommand(tool, args);
        if (res.code === 0) {
          void vscode.window.showInformationMessage(
            file
              ? `Formatted ${file} with gofmt.`
              : "Formatted Go files with gofmt.",
          );
        } else {
          this._post({ type: "quickFixFailed", checkId, file });
          void vscode.window.showWarningMessage(
            res.stderr.trim() || `gofmt failed to format ${file ?? "files"}.`,
          );
        }
        await vscode.workspace.saveAll(false);
        await this._runPipeline();
      } else if (checkId === "python:format") {
        const ruffTool = await context.resolveTool("ruff");
        const blackTool = !ruffTool ? await context.resolveTool("black") : null;
        const tool = ruffTool ?? blackTool;
        if (!tool) {
          this._post({ type: "quickFixFailed", checkId, file });
          void vscode.window.showErrorMessage(
            "Neither ruff nor black is installed in venv or PATH.",
          );
          return;
        }

        const isRuff = Boolean(ruffTool);
        const args = isRuff
          ? file
            ? ["format", file]
            : ["format", "."]
          : file
            ? [file]
            : ["."];
        const res = await context.runCommand(tool, args);
        if (res.code === 0) {
          void vscode.window.showInformationMessage(
            file
              ? `Formatted ${file} with ${isRuff ? "ruff format" : "black"}.`
              : `Formatted Python files with ${isRuff ? "ruff format" : "black"}.`,
          );
        } else {
          this._post({ type: "quickFixFailed", checkId, file });
          void vscode.window.showWarningMessage(
            res.stderr.trim() || `Failed to format ${file ?? "files"}.`,
          );
        }
        await vscode.workspace.saveAll(false);
        await this._runPipeline();
      } else if (checkId === "php:cs-fixer") {
        const tool = await context.resolveTool("php-cs-fixer");
        if (!tool) {
          this._post({ type: "quickFixFailed", checkId, file });
          void vscode.window.showErrorMessage(
            "php-cs-fixer is not installed in vendor/bin or PATH.",
          );
          return;
        }

        const args = file ? ["fix", file] : ["fix", "."];
        const res = await context.runCommand(tool, args);
        if (res.code === 0) {
          void vscode.window.showInformationMessage(
            file
              ? `Formatted ${file} with php-cs-fixer.`
              : "Formatted PHP files with php-cs-fixer.",
          );
        } else {
          this._post({ type: "quickFixFailed", checkId, file });
          void vscode.window.showWarningMessage(
            res.stderr.trim() ||
              `php-cs-fixer failed to format ${file ?? "files"}.`,
          );
        }
        await vscode.workspace.saveAll(false);
        await this._runPipeline();
      } else {
        const fileConfig = await loadWorkspaceConfig(root);
        const config = this._getConfig(fileConfig);
        const allCustom = [
          ...(config.customChecks ?? []),
          ...(config.customPacks?.flatMap((p) => p.checks) ?? []),
        ];
        const customCheck = allCustom.find((c) => c.id === checkId);
        if (
          customCheck &&
          customCheck.fixArgs &&
          customCheck.fixArgs.length > 0
        ) {
          const tool = await context.resolveTool(customCheck.tool);
          if (!tool) {
            this._post({ type: "quickFixFailed", checkId, file });
            void vscode.window.showErrorMessage(
              `${customCheck.tool} is not installed.`,
            );
            return;
          }

          const args = [...customCheck.fixArgs];
          if (file) args.push(file);
          const res = await context.runCommand(tool, args);
          if (res.code === 0) {
            void vscode.window.showInformationMessage(
              `Fixed with ${customCheck.label}.`,
            );
          } else {
            this._post({ type: "quickFixFailed", checkId, file });
            void vscode.window.showWarningMessage(
              res.stderr.trim() || `QuickFix failed for ${customCheck.label}.`,
            );
          }
          await vscode.workspace.saveAll(false);
          await this._runPipeline();
        }
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

    if (selected) {
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

    if (config.gitHost === "github") {
      const pullRequest = await createGitHubPullRequest(root, prUrl);
      if (pullRequest) {
        const action =
          pullRequest.kind === "created" ? "created" : "already exists";
        void vscode.window.showInformationMessage(
          `GitHub pull request ${action}.`,
        );
        await vscode.env.openExternal(vscode.Uri.parse(pullRequest.url));
        return;
      }

      await vscode.env.clipboard.writeText(prUrl.body);
      void vscode.window.showWarningMessage(
        "GitHub CLI could not create the pull request. Opened a pre-filled GitHub page and copied the description for paste. Install and authenticate gh for direct creation.",
      );
    } else {
      const mergeRequest = await createGitLabMergeRequest(root, prUrl);
      if (mergeRequest) {
        void vscode.window.showInformationMessage(
          "GitLab merge request created.",
        );
        await vscode.env.openExternal(vscode.Uri.parse(mergeRequest.url));
        return;
      }

      await vscode.env.clipboard.writeText(prUrl.body);
      void vscode.window.showWarningMessage(
        "GitLab CLI could not create the merge request. Opened the MR page and copied the description for paste. Install and authenticate glab for direct creation.",
      );
    }

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

  async openConfig(): Promise<void> {
    const root = this._workspaceRoot();
    if (!root) return;

    const configPath = resolve(root, ".mewra-preflight.json");
    let shouldWriteStarter = false;

    try {
      const content = await readFile(configPath, "utf-8");
      if (content.trim().length === 0) {
        shouldWriteStarter = true;
      }
    } catch {
      shouldWriteStarter = true;
    }

    if (shouldWriteStarter) {
      const activeEcosystems = await detectActiveEcosystems(root);
      const ecoEntries: string[] = [];

      if (activeEcosystems.includes("python")) {
        ecoEntries.push(`    "python": {
      "enabled": true,
      "format": { "tool": "ruff", "enabled": true },
      "lint": { "tool": "ruff", "enabled": true },
      "typecheck": { "tool": "mypy", "enabled": true },
      "testPairing": { "enabled": true }
    }`);
      }
      if (activeEcosystems.includes("js-ts")) {
        ecoEntries.push(`    "js-ts": {
      "enabled": true,
      "format": { "tool": "prettier", "enabled": true },
      "lint": { "tool": "eslint", "enabled": true },
      "typecheck": { "tool": "tsc", "enabled": true },
      "testPairing": { "enabled": true }
    }`);
      }
      if (activeEcosystems.includes("go")) {
        ecoEntries.push(`    "go": {
      "enabled": true,
      "format": { "tool": "gofmt", "enabled": true },
      "vet": { "enabled": true },
      "lint": { "tool": "golangci-lint", "enabled": true },
      "testPairing": { "enabled": true }
    }`);
      }
      if (activeEcosystems.includes("php")) {
        ecoEntries.push(`    "php": {
      "enabled": true,
      "format": { "tool": "php-cs-fixer", "enabled": true },
      "analyze": { "tool": "phpstan", "enabled": true },
      "testPairing": { "enabled": true }
    }`);
      }

      ecoEntries.push(`    "pounce": {
      "enabled": true
    }`);

      const ecosystemsBlock =
        ecoEntries.length > 0
          ? `  "ecosystems": {\n${ecoEntries.join(",\n")}\n  },\n`
          : "";

      const template = `{
  "$schema": "https://raw.githubusercontent.com/mewra-lab/mewra-preflight/main/schemas/preflight.schema.json",
  "targetBranch": "main",
${ecosystemsBlock}  "universalChecks": {
    "noDebugStatements": "error",
    "noSecrets": "error",
    "noLocalhostUrls": "error",
    "noMergeConflicts": "error",
    "largeFileThresholdMb": 1
  },
  // Custom manual checklist items (press Ctrl+Space inside to insert a template)
  "manualChecklist": [
    {
      "id": "db-migration",
      "label": "Did you apply database migration to dev DB?",
      "severity": "error",
      "condition": { "modifiedFilesMatch": "prisma/migrations/**" }
    }
  ]
}
`;
      try {
        await writeFile(configPath, template, "utf-8");
      } catch {}
    }

    try {
      const uri = vscode.Uri.file(configPath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        preview: false,
      });
    } catch {
      void vscode.window.showErrorMessage(
        "Could not open .mewra-preflight.json",
      );
    }
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
