import type {
  ChangedFile,
  ManualCheckConfig,
  ManualCheckItem,
} from "../../shared/types.js";

// MARK: - Helpers

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/(?<!\.)\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function doesFileMatch(file: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return file.startsWith(`${prefix}/`) || file === prefix;
  }
  return globToRegex(pattern).test(file);
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
