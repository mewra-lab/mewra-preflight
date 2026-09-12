import { useState } from "preact/hooks";
import type { CheckSnapshot, CheckStatus } from "../../shared/types.js";

// MARK: - Types

type CheckRowProps = {
  snapshot: CheckSnapshot;
  onOpenFinding?: (path: string, line: number) => void;
};

// MARK: - Status Icon Component

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") {
    return <span class="status-indicator status-indicator--pass">✓</span>;
  }
  if (status === "fail") {
    return <span class="status-indicator status-indicator--fail">✕</span>;
  }
  if (status === "warning") {
    return <span class="status-indicator status-indicator--warning">▲</span>;
  }
  if (status === "running") {
    return <span class="status-indicator status-indicator--running">⟳</span>;
  }
  return <span class="status-indicator status-indicator--neutral">—</span>;
}

// MARK: - CheckRow Component

export function CheckRow({ snapshot, onOpenFinding }: CheckRowProps) {
  const { definition, result } = snapshot;
  const hasFindings = result.findings.length > 0;
  const [expanded, setExpanded] = useState(hasFindings);

  const toggleExpanded = () => {
    if (hasFindings) {
      setExpanded(!expanded);
    }
  };

  return (
    <div
      class={`check-row check-row--${result.status} ${hasFindings ? "check-row--has-findings" : ""}`}
    >
      <div
        class="check-row__header"
        onClick={toggleExpanded}
        role={hasFindings ? "button" : undefined}
        tabIndex={hasFindings ? 0 : undefined}
        onKeyDown={(e) => {
          if (hasFindings && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            toggleExpanded();
          }
        }}
      >
        <StatusIcon status={result.status} />
        <span class="check-row__label">{definition.label}</span>

        {result.message && !hasFindings && (
          <span class="check-row__short-message">{result.message}</span>
        )}

        <div class="check-row__meta">
          {result.durationMs !== undefined && (
            <span class="check-row__duration">
              {result.durationMs < 1000
                ? `${result.durationMs}ms`
                : `${(result.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {hasFindings && (
            <span class="check-row__toggle-icon">{expanded ? "▾" : "▸"}</span>
          )}
        </div>
      </div>

      {result.message && hasFindings && (
        <p class="check-row__message">{result.message}</p>
      )}

      {hasFindings && expanded && (
        <ul class="check-row__findings">
          {result.findings.map((f, i) => (
            <li
              key={i}
              class="finding"
              onClick={() => onOpenFinding?.(f.file, f.line)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpenFinding?.(f.file, f.line);
              }}
            >
              <span class="finding__badge">
                {f.file}:{f.line}
              </span>
              <span class="finding__message">{f.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
