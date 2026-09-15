import type { GitDiff } from "../../shared/types.js";

// MARK: - Types

export interface IgnoreEntry {
  pattern: string;
  regex: RegExp;
  target?: string;
}

export interface PreflightIgnoreRules {
  globalIgnores: IgnoreEntry[];
  targetedIgnores: IgnoreEntry[];
}

// MARK: - Glob Matching

function globToRegex(glob: string): RegExp {
  const normalized = glob.replace(/^\.\//, "").trim();
  const hasSlash = normalized.includes("/");
  let regexStr = hasSlash ? "" : "(?:.*\\/)?";
  let i = 0;
  while (i < normalized.length) {
    const c = normalized[i];
    if (c === undefined) break;
    if (c === "*" && normalized[i + 1] === "*") {
      if (normalized[i + 2] === "/") {
        regexStr += "(?:.*\\/)?";
        i += 3;
      } else {
        regexStr += ".*";
        i += 2;
      }
    } else if (c === "*") {
      regexStr += "[^\\/]*";
      i++;
    } else if (c === "?") {
      regexStr += "[^\\/]";
      i++;
    } else if (
      ["[", "]", "(", ")", "+", "$", "^", ".", "{", "}", "|", "\\"].includes(c)
    ) {
      regexStr += `\\${c}`;
      i++;
    } else {
      regexStr += c;
      i++;
    }
  }
  return new RegExp(`^${regexStr}$`);
}

function matchesGlob(path: string, regex: RegExp): boolean {
  const cleanPath = path.replace(/^\.\//, "");
  return regex.test(cleanPath);
}

// MARK: - Parsing

export function parsePreflightIgnore(content: string): PreflightIgnoreRules {
  const globalIgnores: IgnoreEntry[] = [];
  const targetedIgnores: IgnoreEntry[] = [];

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0 && !trimmed.slice(0, colonIdx).includes("://")) {
      const pattern = trimmed.slice(0, colonIdx).trim();
      const target = trimmed.slice(colonIdx + 1).trim();
      if (pattern && target) {
        targetedIgnores.push({
          pattern,
          regex: globToRegex(pattern),
          target,
        });
        continue;
      }
    }

    globalIgnores.push({
      pattern: trimmed,
      regex: globToRegex(trimmed),
    });
  }

  return { globalIgnores, targetedIgnores };
}

// MARK: - Filtering

export function isPathIgnoredGlobally(
  filePath: string,
  rules: PreflightIgnoreRules,
): boolean {
  return rules.globalIgnores.some((entry) =>
    matchesGlob(filePath, entry.regex),
  );
}

export function isCheckIgnoredForFile(
  checkId: string,
  pack: string,
  filePath: string,
  rules: PreflightIgnoreRules,
): boolean {
  if (isPathIgnoredGlobally(filePath, rules)) {
    return true;
  }

  for (const entry of rules.targetedIgnores) {
    if (matchesGlob(filePath, entry.regex)) {
      if (!entry.target || entry.target === "*") {
        return true;
      }
      if (entry.target === checkId) {
        return true;
      }
      if (entry.target === pack || entry.target === `pack:${pack}`) {
        return true;
      }
    }
  }

  return false;
}

function filterRawPatch(rawPatch: string, allowedPaths: Set<string>): string {
  if (!rawPatch) return rawPatch;

  return rawPatch
    .split(/(?=^diff --git )/m)
    .filter((section) => {
      const match = /^diff --git a\/.* b\/(.*)$/m.exec(section);
      return match ? allowedPaths.has(match[1]!) : false;
    })
    .join("\n");
}

export function filterDiffForCheck(
  diff: GitDiff,
  checkId: string,
  pack: string,
  rules: PreflightIgnoreRules,
): GitDiff {
  const changedFiles = diff.changedFiles.filter(
    (file) => !isCheckIgnoredForFile(checkId, pack, file.path, rules),
  );

  return {
    ...diff,
    changedFiles,
    rawPatch: filterRawPatch(
      diff.rawPatch,
      new Set(changedFiles.map((file) => file.path)),
    ),
  };
}

export function filterDiffByPreflightIgnore(
  diff: GitDiff,
  rules: PreflightIgnoreRules,
): GitDiff {
  const changedFiles = diff.changedFiles.filter(
    (file) => !isPathIgnoredGlobally(file.path, rules),
  );

  return {
    ...diff,
    changedFiles,
    rawPatch: filterRawPatch(
      diff.rawPatch,
      new Set(changedFiles.map((file) => file.path)),
    ),
  };
}
