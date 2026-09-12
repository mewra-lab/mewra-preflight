// MARK: - Types

type PrButtonProps = {
  blocked: boolean;
  onLaunch: () => void;
};

// MARK: - Component

export function PrButton({ blocked, onLaunch }: PrButtonProps) {
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
      <span class="pr-button__icon">{blocked ? "🔒" : "↗"}</span>
      <span>{blocked ? "Resolve Errors to Open PR" : "Open Pull Request"}</span>
    </button>
  );
}
