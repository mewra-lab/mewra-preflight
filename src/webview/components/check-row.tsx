import { useState } from "preact/hooks";
import type { CheckSnapshot, CheckStatus } from "../../shared/types.js";

// MARK: - Types

type CheckRowProps = {
  snapshot: CheckSnapshot;
  onOpenFinding?: (path: string, line: number) => void;
  onQuickFix?: (checkId: string, file?: string) => void;
};

// MARK: - Status Icon Component

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") {
    return (
      <span class="status-indicator status-indicator--pass">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span class="status-indicator status-indicator--fail">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span class="status-indicator status-indicator--warning">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </span>
    );
  }
  if (status === "running") {
    return (
      <span class="status-indicator status-indicator--running">
        <svg
          class="spinner-svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </span>
    );
  }
  return (
    <span class="status-indicator status-indicator--neutral">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </span>
  );
}

// MARK: - CheckRow Component

export function CheckRow({
  snapshot,
  onOpenFinding,
  onQuickFix,
}: CheckRowProps) {
  const { definition, result } = snapshot;
  const hasFindings = result.findings.length > 0;
  const [expanded, setExpanded] = useState(hasFindings);
  const isFixable =
    definition.id === "js-ts:prettier" || definition.id === "js-ts:eslint";

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
          {hasFindings && isFixable && (
            <button
              class="quick-fix-btn quick-fix-btn--header"
              onClick={(e) => {
                e.stopPropagation();
                onQuickFix?.(definition.id);
              }}
              title={`Auto-fix all issues with ${definition.label}`}
            >
              Fix All
            </button>
          )}

          {result.durationMs !== undefined && (
            <span class="check-row__duration">
              {result.durationMs < 1000
                ? `${result.durationMs}ms`
                : `${(result.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {hasFindings && (
            <span class="check-row__toggle-icon">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style={{
                  transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.15s ease",
                }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
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
              title={`Jump to ${f.file}:${f.line}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpenFinding?.(f.file, f.line);
              }}
            >
              <span class="finding__badge">
                <span class="finding__badge-text">
                  {f.file}:{f.line}
                </span>
                <span class="finding__badge-arrow">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                </span>
              </span>
              <span class="finding__message">{f.message}</span>

              {isFixable && (
                <button
                  class="quick-fix-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickFix?.(definition.id, f.file);
                  }}
                  title={`Fix ${f.file}`}
                >
                  Fix
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
