import type { CheckRunner } from "../../check-contract.js";
import type {
  CheckFinding,
  CheckResult,
  GitDiff,
} from "../../../../shared/types.js";
import { parseAddedLines } from "../../../diff/parse-patch.js";

// MARK: - Tailwind Conflicts

const TEMPLATE_FILE = /\.(?:tsx|jsx|vue|html|astro|svelte)$/;
const CLASS_ATTRIBUTE = /\b(?:class|className)\s*=\s*["']([^"']+)["']/g;

function splitVariant(token: string): { variant: string; utility: string } {
  let depth = 0;
  let lastSeparator = -1;
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === "[") depth += 1;
    else if (character === "]") depth = Math.max(0, depth - 1);
    else if (character === ":" && depth === 0) lastSeparator = index;
  }
  return lastSeparator === -1
    ? { variant: "", utility: token }
    : {
        variant: token.slice(0, lastSeparator),
        utility: token.slice(lastSeparator + 1),
      };
}

function utilityGroup(token: string): string | null {
  const { variant, utility } = splitVariant(token);
  const normalized = utility.replace(/^!/, "");
  const group = (() => {
    if (/^(?:p|px|py|pt|pr|pb|pl)-/.test(normalized))
      return normalized.split("-")[0] ?? null;
    if (/^(?:m|mx|my|mt|mr|mb|ml)-/.test(normalized))
      return normalized.split("-")[0] ?? null;
    if (/^bg-/.test(normalized)) return "bg";
    if (/^font-/.test(normalized)) return "font";
    if (/^grid-cols-/.test(normalized)) return "grid-cols";
    if (/^text-(?:xs|sm|base|lg|xl|\d+xl)$/.test(normalized))
      return "text-size";
    if (
      /^text-(?:black|white|transparent|current|[a-z]+-\d{2,3})$/.test(
        normalized,
      )
    )
      return "text-color";
    return null;
  })();
  return group ? `${variant}|${group}` : null;
}

function conflictingUtilities(classList: string): string[] {
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const token of classList.trim().split(/\s+/)) {
    const group = utilityGroup(token);
    if (!group) continue;
    const existing = seen.get(group);
    if (existing && existing !== token)
      conflicts.push(`${existing} / ${token}`);
    else seen.set(group, token);
  }
  return conflicts;
}

export const styleTailwindConflictsCheck: CheckRunner = {
  id: "style-guardian:tailwind-conflicts",
  label: "Style Guardian — Tailwind Conflicts",
  severity: "warning",
  pack: "style-guardian",

  appliesTo(diff: GitDiff): boolean {
    return diff.changedFiles.some((file) => TEMPLATE_FILE.test(file.path));
  },

  async run(diff: GitDiff): Promise<CheckResult> {
    const findings: CheckFinding[] = [];
    for (const line of parseAddedLines(diff.rawPatch)) {
      if (!TEMPLATE_FILE.test(line.file)) continue;
      for (const match of line.content.matchAll(CLASS_ATTRIBUTE)) {
        const classList = match[1];
        if (!classList) continue;
        const conflicts = conflictingUtilities(classList);
        if (conflicts.length > 0) {
          findings.push({
            file: line.file,
            line: line.line,
            message: `Conflicting Tailwind utilities: ${conflicts.join(", ")}.`,
            rule: "style-guardian:tailwind-conflicts",
          });
        }
      }
    }

    return findings.length > 0
      ? {
          status: "warning",
          findings,
          message: `${findings.length} Tailwind class conflict${findings.length === 1 ? "" : "s"} found.`,
        }
      : {
          status: "pass",
          findings: [],
          message: "No Tailwind class conflicts found in changed templates.",
        };
  },
};
