import { useState, useEffect, useCallback } from "preact/hooks";
import type {
  PreFlightSnapshot,
  CheckStatus,
  DiffScope,
} from "../shared/types.js";
import { ExtensionMessageSchema } from "../shared/messages.js";
import type { WebviewMessage } from "../shared/messages.js";
import { CheckRow } from "./components/check-row.js";
import { PrButton } from "./components/pr-button.js";

// MARK: - VS Code API

declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
};

const vscode = acquireVsCodeApi();

function post(msg: WebviewMessage): void {
  vscode.postMessage(msg);
}

// MARK: - Types

type AppState =
  | { phase: "idle" }
  | { phase: "running"; snapshot: PreFlightSnapshot }
  | { phase: "done"; snapshot: PreFlightSnapshot }
  | { phase: "error"; message: string };

// MARK: - Helpers

function isBlocked(status: CheckStatus, blockOnWarnings: boolean): boolean {
  if (status === "fail") return true;
  if (blockOnWarnings && status === "warning") return true;
  return false;
}

function StatusPill({ status }: { status: CheckStatus }) {
  const labels: Record<CheckStatus, string> = {
    pass: "Passed",
    fail: "Failed",
    warning: "Warnings",
    "not-configured": "Not Configured",
    skipped: "Skipped",
    running: "Running",
    pending: "Pending",
  };

  return (
    <div class={`status-pill status-pill--${status}`}>
      <span class="status-pill__dot" />
      <span class="status-pill__text">{labels[status]}</span>
    </div>
  );
}

// MARK: - App Component

export function App() {
  const [state, setState] = useState<AppState>({ phase: "idle" });

  useEffect(() => {
    const handler = (event: MessageEvent<unknown>) => {
      const parsed = ExtensionMessageSchema.safeParse(event.data);
      if (!parsed.success) return;

      const msg = parsed.data;

      if (msg.type === "snapshot") {
        const snapshot = msg.payload;
        const phase = snapshot.finishedAt !== undefined ? "done" : "running";
        setState({ phase, snapshot });
      } else if (msg.type === "error") {
        setState({ phase: "error", message: msg.message });
      }
    };

    window.addEventListener("message", handler);
    post({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleRun = useCallback(() => {
    setState({ phase: "idle" });
    post({ type: "runPipeline" });
  }, []);

  const handleLaunchPR = useCallback(() => {
    post({ type: "launchPR" });
  }, []);

  const handleOpenFinding = useCallback((path: string, line: number) => {
    post({ type: "openFile", path, line });
  }, []);

  const handleScopeChange = useCallback((scope: DiffScope) => {
    post({ type: "changeDiffScope", scope });
  }, []);

  const handleQuickFix = useCallback((checkId: string, file?: string) => {
    post({ type: "quickFix", checkId, file });
  }, []);

  if (state.phase === "idle") {
    return (
      <div class="glass-shell">
        <header class="navbar">
          <div class="navbar__brand">
            <span class="navbar__title">Mewra PreFlight</span>
          </div>
        </header>

        <div class="hero-card">
          <div class="hero-card__badge">Pre-Push Pipeline</div>
          <h2 class="hero-card__title">Validate your diff before pushing</h2>
          <p class="hero-card__desc">
            Fast, diff-scoped sanity checks for Prettier, ESLint, TypeScript,
            and credentials.
          </p>
          <button class="glass-btn glass-btn--primary" onClick={handleRun}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
            <span>Run Pipeline</span>
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div class="glass-shell">
        <header class="navbar">
          <div class="navbar__brand">
            <span class="navbar__title">Mewra PreFlight</span>
          </div>
          <button class="glass-btn glass-btn--ghost" onClick={handleRun}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            <span>Re-run</span>
          </button>
        </header>

        <div class="error-panel">
          <svg
            class="error-panel__icon"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3 class="error-panel__title">Pipeline Error</h3>
          <p class="error-panel__message">{state.message}</p>
        </div>
      </div>
    );
  }

  const { snapshot } = state;
  const blocked = isBlocked(snapshot.overallStatus, false);
  const isRunning = state.phase === "running";
  const changedCount = snapshot.diff?.changedFiles.length ?? 0;
  const currentScope = snapshot.diff?.scope ?? "branch";

  return (
    <div class="glass-shell">
      <header class="navbar">
        <div class="navbar__brand">
          <span class="navbar__title">PreFlight</span>
        </div>

        <div class="navbar__center">
          <StatusPill status={snapshot.overallStatus} />
        </div>

        <button
          class="glass-btn glass-btn--ghost"
          onClick={handleRun}
          disabled={isRunning}
        >
          <svg
            class={isRunning ? "spinner-svg" : ""}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          <span>{isRunning ? "Running" : "Re-run"}</span>
        </button>
      </header>

      {snapshot.diff && (
        <div class="diff-container">
          <div class="scope-selector">
            <button
              class={`scope-tab ${currentScope === "branch" ? "scope-tab--active" : ""}`}
              onClick={() => handleScopeChange("branch")}
            >
              Branch
            </button>
            <button
              class={`scope-tab ${currentScope === "staged" ? "scope-tab--active" : ""}`}
              onClick={() => handleScopeChange("staged")}
            >
              Staged
            </button>
            <button
              class={`scope-tab ${currentScope === "working" ? "scope-tab--active" : ""}`}
              onClick={() => handleScopeChange("working")}
            >
              Working Tree
            </button>
          </div>

          <div class="diff-strip">
            <div class="diff-strip__info">
              <svg
                class="diff-strip__icon"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              <span class="diff-strip__branch">{snapshot.diff.headBranch}</span>
              {currentScope !== "staged" && currentScope !== "working" && (
                <>
                  <svg
                    class="diff-strip__arrow"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                  <span class="diff-strip__target">
                    {snapshot.diff.baseBranch}
                  </span>
                </>
              )}
            </div>
            <div class="diff-strip__stats">
              <span class="diff-strip__count">
                {changedCount} changed {changedCount === 1 ? "file" : "files"}
              </span>
            </div>
          </div>
        </div>
      )}

      <main class="check-list">
        {snapshot.checks.map((snap) => (
          <CheckRow
            key={snap.definition.id}
            snapshot={snap}
            onOpenFinding={handleOpenFinding}
            onQuickFix={handleQuickFix}
          />
        ))}
      </main>

      {state.phase === "done" && (
        <footer class="footer-bar">
          <PrButton blocked={blocked} onLaunch={handleLaunchPR} />
        </footer>
      )}
    </div>
  );
}
