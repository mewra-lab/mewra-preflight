import type {
  ChangedFile,
  ManualCheckConfig,
  ManualCheckItem,
} from "../../shared/types.js";
import { globToRegex } from "../config/preflight-ignore.js";

// MARK: - Helpers

export function doesFileMatch(file: string, pattern: string): boolean {
  return globToRegex(pattern, false).test(file.replace(/^\.\//, ""));
}

// MARK: - Evaluator

export function evaluateManualChecks(
  configs: ManualCheckConfig[],
  changedFiles: ChangedFile[],
  checkedMap: Map<string, boolean>,
): ManualCheckItem[] {
  return configs.map((cfg) => {
    let triggered = true;
    if (cfg.condition?.modifiedFilesMatch) {
      const pat = cfg.condition.modifiedFilesMatch;
      triggered = changedFiles.some((f) => doesFileMatch(f.path, pat));
    }

    const checked = checkedMap.get(cfg.id) ?? false;
    const severity = cfg.severity ?? "error";

    return {
      id: cfg.id,
      label: cfg.label,
      severity,
      checked,
      condition: cfg.condition,
      triggered,
    };
  });
}
