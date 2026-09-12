import { useState, useEffect, useCallback } from "preact/hooks";
import type { PreFlightSnapshot, CheckStatus } from "../shared/types.js";
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

  if (state.phase === "idle") {
    return (
      <div class="glass-shell">
        <header class="navbar">
          <div class="navbar__brand">
            <span class="navbar__icon">🚀</span>
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
            <span>▶</span>
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
            <span class="navbar__icon">🚀</span>
            <span class="navbar__title">Mewra PreFlight</span>
          </div>
          <button class="glass-btn glass-btn--ghost" onClick={handleRun}>
            <span>↻</span>
            <span>Re-run</span>
          </button>
        </header>

        <div class="error-panel">
          <span class="error-panel__icon">⚠</span>
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

  return (
    <div class="glass-shell">
      <header class="navbar">
        <div class="navbar__brand">
          <span class="navbar__icon">🚀</span>
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
          <span class={isRunning ? "spinner-icon" : ""}>
            {isRunning ? "⟳" : "↻"}
          </span>
          <span>{isRunning ? "Running" : "Re-run"}</span>
        </button>
      </header>

      {snapshot.diff && (
        <div class="diff-strip">
          <div class="diff-strip__info">
            <span class="diff-strip__icon">⎇</span>
            <span class="diff-strip__branch">{snapshot.diff.headBranch}</span>
            <span class="diff-strip__arrow">→</span>
            <span class="diff-strip__target">{snapshot.diff.baseBranch}</span>
          </div>
          <div class="diff-strip__stats">
            <span class="diff-strip__count">
              {changedCount} changed {changedCount === 1 ? "file" : "files"}
            </span>
          </div>
        </div>
      )}

      <main class="check-list">
        {snapshot.checks.map((snap) => (
          <CheckRow
            key={snap.definition.id}
            snapshot={snap}
            onOpenFinding={handleOpenFinding}
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
