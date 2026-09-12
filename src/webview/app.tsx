import { useState, useEffect, useCallback } from "preact/hooks";
import type { PreFlightSnapshot, CheckStatus } from "../shared/types.js";
import { ExtensionMessageSchema } from "../shared/messages.js";
import type { WebviewMessage } from "../shared/messages.js";
import { CheckRow } from "./components/check-row.js";
import { PrButton } from "./components/pr-button.js";

declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
};

const vscode = acquireVsCodeApi();

function post(msg: WebviewMessage): void {
  vscode.postMessage(msg);
}

type AppState =
  | { phase: "idle" }
  | { phase: "running"; snapshot: PreFlightSnapshot }
  | { phase: "done"; snapshot: PreFlightSnapshot }
  | { phase: "error"; message: string };

function isBlocked(status: CheckStatus, blockOnWarnings: boolean): boolean {
  if (status === "fail") return true;
  if (blockOnWarnings && status === "warning") return true;
  return false;
}

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
      <div class="container">
        <header class="header">
          <h1 class="header__title">Mewra PreFlight</h1>
        </header>
        <div class="empty-state">
          <p class="empty-state__text">
            Run the pipeline to validate your diff before pushing.
          </p>
          <button class="run-button" onClick={handleRun}>
            ▶ Run Pipeline
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div class="container">
        <header class="header">
          <h1 class="header__title">Mewra PreFlight</h1>
          <button class="run-button run-button--header" onClick={handleRun}>
            ▶ Re-run
          </button>
        </header>
        <div class="error-state">
          <span class="error-state__icon">⚠</span>
          <p class="error-state__message">{state.message}</p>
        </div>
      </div>
    );
  }

  const { snapshot } = state;
  const blocked = isBlocked(snapshot.overallStatus, false);
  const isRunning = state.phase === "running";
  const changedCount = snapshot.diff?.changedFiles.length ?? 0;

  return (
    <div class="container">
      <header class="header">
        <h1 class="header__title">Mewra PreFlight</h1>
        <span class={`status-badge status-badge--${snapshot.overallStatus}`}>
          {snapshot.overallStatus}
        </span>
        {isRunning && <span class="spinner" aria-label="Running" />}
        <button
          class="run-button run-button--header"
          onClick={handleRun}
          disabled={isRunning}
        >
          ▶ Re-run
        </button>
      </header>

      {snapshot.diff && (
        <p class="diff-summary">
          {changedCount} file{changedCount !== 1 ? "s" : ""} changed vs{" "}
          <code>{snapshot.diff.baseBranch}</code>
        </p>
      )}

      <section class="checks">
        {snapshot.checks.map((snap) => (
          <CheckRow
            key={snap.definition.id}
            snapshot={snap}
            onOpenFinding={handleOpenFinding}
          />
        ))}
      </section>

      {state.phase === "done" && (
        <footer class="footer">
          <PrButton blocked={blocked} onLaunch={handleLaunchPR} />
        </footer>
      )}
    </div>
  );
}
