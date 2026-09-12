import type { CheckSnapshot, CheckStatus } from "../../shared/types.js";

type StatusIconProps = { status: CheckStatus };

function StatusIcon({ status }: StatusIconProps) {
  const icons: Record<CheckStatus, string> = {
    pass: "✓",
    fail: "✗",
    warning: "⚠",
    "not-configured": "—",
    skipped: "⊘",
    running: "⟳",
    pending: "○",
  };
  return <span class={`status-icon status-${status}`}>{icons[status]}</span>;
}

type CheckRowProps = {
  snapshot: CheckSnapshot;
  onOpenFinding?: (path: string, line: number) => void;
};

export function CheckRow({ snapshot, onOpenFinding }: CheckRowProps) {
  const { definition, result } = snapshot;

  return (
    <div class={`check-row check-row--${result.status}`}>
      <div class="check-row__header">
        <StatusIcon status={result.status} />
        <span class="check-row__label">{definition.label}</span>
        {result.durationMs !== undefined && (
          <span class="check-row__duration">
            {result.durationMs < 1000
              ? `${result.durationMs}ms`
              : `${(result.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>

      {result.message && <p class="check-row__message">{result.message}</p>}

      {result.findings.length > 0 && (
        <ul class="check-row__findings">
          {result.findings.slice(0, 8).map((f, i) => (
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
              <span class="finding__location">
                {f.file}:{f.line}
              </span>
              <span class="finding__message">{f.message}</span>
            </li>
          ))}
          {result.findings.length > 8 && (
            <li class="finding finding--more">
              +{result.findings.length - 8} more findings
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
