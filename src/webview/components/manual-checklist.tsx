import type { ManualCheckItem } from "../../shared/types.js";

// MARK: - Types

type ManualChecklistProps = {
  items: ManualCheckItem[];
  onToggle: (checkId: string, done: boolean) => void;
};

// MARK: - Component

export function ManualChecklist({ items, onToggle }: ManualChecklistProps) {
  if (items.length === 0) return null;

  return (
    <div class="check-group manual-checks">
      <div class="check-group__title">MANUAL CHECKS</div>
      <div class="manual-checks__list">
        {items.map((item) => (
          <label
            key={item.id}
            class={`manual-check-item ${item.checked ? "manual-check-item--checked" : ""}`}
          >
            <input
              type="checkbox"
              class="manual-check-item__checkbox"
              checked={item.checked}
              onChange={(e) =>
                onToggle(item.id, (e.target as HTMLInputElement).checked)
              }
            />
            <div class="manual-check-item__content">
              <div class="manual-check-item__label-row">
                <span class="manual-check-item__label">{item.label}</span>
                {item.severity === "error" && !item.checked && (
                  <span class="manual-check-item__badge manual-check-item__badge--error">
                    Blocker
                  </span>
                )}
              </div>
              {item.condition?.modifiedFilesMatch && (
                <div class="manual-check-item__trigger">
                  Triggered: <code>{item.condition.modifiedFilesMatch}</code>{" "}
                  was modified
                </div>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
