import { useState } from "preact/hooks";
import type {
  CheckSnapshot,
  CheckStatus,
  PounceRouteChip,
} from "../../shared/types.js";

// MARK: - Types

type CheckRowProps = {
  snapshot: CheckSnapshot;
  onOpenFinding?: (path: string, line: number) => void;
  onQuickFix?: (checkId: string, file?: string) => void;
  onInstallTool?: (tool: string, pack?: string) => void;
  onConfigureCheck?: (checkId: string) => void;
  fixingTarget?: string | null;
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

// MARK: - Route Chip Component

function RouteChip({
  chip,
  onOpenFinding,
}: {
  chip: PounceRouteChip;
  onOpenFinding?: ((path: string, line: number) => void) | undefined;
}) {
  const methodClass = chip.method.toLowerCase();
  return (
    <span
      class={`route-chip route-chip--${methodClass}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpenFinding?.(chip.file, chip.line ?? 0);
      }}
      role="button"
      tabIndex={0}
      title={`Jump to ${chip.file}:${chip.line ?? 0}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.stopPropagation();
          onOpenFinding?.(chip.file, chip.line ?? 0);
        }
      }}
    >
      <span class="route-chip__method">{chip.method}</span>
      <span class="route-chip__path">{chip.route}</span>
    </span>
  );
}

// MARK: - CheckRow Component

export function CheckRow({
  snapshot,
  onOpenFinding,
  onQuickFix,
  onInstallTool,
  onConfigureCheck,
  fixingTarget,
}: CheckRowProps) {
  const { definition, result } = snapshot;
  const hasFindings = result.findings.length > 0;
  const hasRoutes = (result.routes?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(hasFindings || hasRoutes);
  const isFixable =
    definition.id === "js-ts:prettier" ||
    definition.id === "js-ts:eslint" ||
    definition.id === "go:gofmt" ||
    definition.id === "python:format" ||
    definition.id === "php:cs-fixer" ||
    definition.fixable === true;
  const isFixingAll = fixingTarget === definition.id;
  const isPounce = definition.pack === "pounce";

  const toggleExpanded = () => {
    if (hasFindings || hasRoutes) {
      setExpanded(!expanded);
    }
  };

  return (
    <div
      class={`check-row check-row--${result.status} ${hasFindings || hasRoutes ? "check-row--has-findings" : ""}`}
    >
      <div
        class="check-row__header"
        onClick={toggleExpanded}
        role={hasFindings || hasRoutes ? "button" : undefined}
        tabIndex={hasFindings || hasRoutes ? 0 : undefined}
        onKeyDown={(e) => {
          if (
            (hasFindings || hasRoutes) &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            toggleExpanded();
          }
        }}
      >
        <StatusIcon status={result.status} />
        <span class="check-row__label" title={definition.label}>
          {definition.label}
        </span>

        {isPounce && hasRoutes && (
          <span
            class="blast-radius-badge"
            title={`${result.routes!.length} impacted route${result.routes!.length === 1 ? "" : "s"}`}
          >
            {result.routes!.length} route
            {result.routes!.length === 1 ? "" : "s"}
          </span>
        )}

        {result.message && !hasFindings && !hasRoutes && (
          <span class="check-row__short-message" title={result.message}>
            {result.message}
          </span>
        )}

        <div class="check-row__meta">
          {result.status === "not-configured" &&
            definition.setupCommand &&
            onConfigureCheck && (
              <button
                class="quick-fix-btn quick-fix-btn--install"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfigureCheck(definition.id);
                }}
                title={`Set up ${definition.label}`}
              >
                Set up
              </button>
            )}

          {result.status === "not-configured" &&
            definition.installable !== false &&
            onInstallTool && (
              <button
                class="quick-fix-btn quick-fix-btn--install"
                onClick={(e) => {
                  e.stopPropagation();
                  const tool = definition.id.includes(":")
                    ? (definition.id.split(":")[1] ?? definition.id)
                    : definition.id;
                  onInstallTool(tool, definition.pack);
                }}
                title={`Install ${definition.label}`}
              >
                Install
              </button>
            )}

          {hasFindings && isFixable && (
            <button
              class={`quick-fix-btn quick-fix-btn--header ${isFixingAll ? "quick-fix-btn--loading" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!isFixingAll) onQuickFix?.(definition.id);
              }}
              disabled={isFixingAll}
              title={`Auto-fix all issues with ${definition.label}`}
            >
              {isFixingAll ? (
                <>
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
                  <span>Fixing...</span>
                </>
              ) : (
                "Fix All"
              )}
            </button>
          )}

          {result.durationMs !== undefined && (
            <span class="check-row__duration">
              {result.durationMs < 1000
                ? `${result.durationMs}ms`
                : `${(result.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {(hasFindings || hasRoutes) && (
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

      {result.message && (hasFindings || hasRoutes) && (
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

              {isFixable &&
                (() => {
                  const isFixingFile =
                    fixingTarget === `${definition.id}:${f.file}`;
                  const isDisabled = isFixingFile || isFixingAll;
                  return (
                    <button
                      class={`quick-fix-btn ${isFixingFile ? "quick-fix-btn--loading" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDisabled) onQuickFix?.(definition.id, f.file);
                      }}
                      disabled={isDisabled}
                      title={`Fix ${f.file}`}
                    >
                      {isFixingFile ? (
                        <>
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
                          <span>Fixing...</span>
                        </>
                      ) : (
                        "Fix"
                      )}
                    </button>
                  );
                })()}
            </li>
          ))}
        </ul>
      )}

      {isPounce && hasRoutes && expanded && (
        <div class="route-chips">
          {result.routes!.map((chip, i) => (
            <RouteChip key={i} chip={chip} onOpenFinding={onOpenFinding} />
          ))}
        </div>
      )}
    </div>
  );
}
