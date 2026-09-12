type PrButtonProps = {
  blocked: boolean;
  onLaunch: () => void;
};

export function PrButton({ blocked, onLaunch }: PrButtonProps) {
  return (
    <button
      class={`pr-button ${blocked ? "pr-button--blocked" : "pr-button--ready"}`}
      disabled={blocked}
      onClick={onLaunch}
      title={
        blocked ? "Fix all errors before opening a PR." : "Open PR in browser"
      }
    >
      {blocked ? "Fix errors first" : "↗ Open Pull Request"}
    </button>
  );
}
