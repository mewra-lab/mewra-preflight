// MARK: - Types

type PrButtonProps = {
  blocked: boolean;
  blockerCount?: number;
  onLaunch: () => void;
};

// MARK: - Component

export function PrButton({
  blocked,
  blockerCount = 0,
  onLaunch,
}: PrButtonProps) {
  const label = blocked
    ? blockerCount > 0
      ? `Push & Create PR (${blockerCount} ${blockerCount === 1 ? "blocker" : "blockers"} remaining)`
      : "Resolve Errors to Open PR"
    : "Push & Create PR";

  return (
    <button
      class={`pr-button ${blocked ? "pr-button--blocked" : "pr-button--ready"}`}
      disabled={blocked}
      onClick={onLaunch}
      title={
        blocked
          ? "Fix all failing checks before creating a pull request."
          : "Create Pull Request in browser"
      }
    >
      <span class="pr-button__icon">
        {blocked ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 17 7 17 17" />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}
