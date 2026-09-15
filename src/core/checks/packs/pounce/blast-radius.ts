import type { CheckRunner } from "../../check-contract.js";
import type { GitDiff, CheckResult } from "../../../../shared/types.js";
import { scanEntryPoints, buildMermaidDiagram } from "./entry-point-scanner.js";

// MARK: - Blast Radius Check

const ROUTE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".go",
  ".py",
  ".php",
  ".rb",
  ".rs",
]);

function hasRouteFile(diff: GitDiff): boolean {
  return diff.changedFiles.some((f) => {
    const dot = f.path.lastIndexOf(".");
    const ext = dot >= 0 ? f.path.slice(dot) : "";
    return ROUTE_EXTENSIONS.has(ext);
  });
}

export const pounceBlastRadiusCheck: CheckRunner = {
  id: "pounce:blast-radius",
  label: "Mewra Pounce — Blast Radius",
  severity: "warning",
  pack: "pounce",

  appliesTo(diff: GitDiff): boolean {
    return hasRouteFile(diff);
  },

  async run(diff: GitDiff): Promise<CheckResult> {
    const chips = scanEntryPoints(diff);

    if (chips.length === 0) {
      return {
        status: "pass",
        findings: [],
        message: "No impacted entry points detected in this diff.",
      };
    }

    const modifiedPaths = diff.changedFiles
      .filter((f) => f.status !== "deleted")
      .map((f) => f.path);

    const mermaid = buildMermaidDiagram(chips, modifiedPaths);

    const findings = chips.map((chip) => ({
      file: chip.file,
      line: chip.line ?? 0,
      message: `Entry point reached: ${chip.method} ${chip.route}`,
    }));

    return {
      status: "warning",
      findings,
      message: `${chips.length} entry point${chips.length === 1 ? "" : "s"} impacted by this diff.`,
      mermaid,
      routes: chips,
    };
  },
};
