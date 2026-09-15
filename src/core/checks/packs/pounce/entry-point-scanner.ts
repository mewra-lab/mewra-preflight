import type { GitDiff, PounceRouteChip } from "../../../../shared/types.js";

// MARK: - Route Pattern Definitions

type RoutePattern = {
  regex: RegExp;
  method: (match: RegExpExecArray) => string;
  route: (match: RegExpExecArray, filePath?: string) => string;
};

function inferNextRoute(filePath?: string): string {
  if (!filePath) return "(Next.js route handler)";
  const m = /(?:apps\/[^/]+\/)?(?:src\/)?app\/(.+)\/route\.[a-zA-Z0-9]+$/.exec(
    filePath,
  );
  if (m && m[1]) return `/${m[1]}`;
  const p = /(?:apps\/[^/]+\/)?(?:src\/)?app\/(.+)\/page\.[a-zA-Z0-9]+$/.exec(
    filePath,
  );
  if (p && p[1]) return `/${p[1]}`;
  if (/(?:apps\/[^/]+\/)?(?:src\/)?app\/page\.[a-zA-Z0-9]+$/.test(filePath)) {
    return "/";
  }
  return "(Next.js route handler)";
}

const PATTERNS: RoutePattern[] = [
  {
    regex:
      /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/,
    method: (m) => m[1]!,
    route: (_m, filePath) => inferNextRoute(filePath),
  },
  {
    regex:
      /export\s+default\s+(?:async\s+)?function\s+(?:Page|Layout|page|layout)\s*\(/,
    method: () => "GET",
    route: (_m, filePath) => inferNextRoute(filePath),
  },
  {
    regex:
      /(?:app|api|hono|router|route)?\s*\.\s*(get|post|put|patch|delete|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/i,
    method: (m) => (m[1] ?? "ANY").toUpperCase(),
    route: (m) => m[2] ?? "/",
  },
  {
    regex:
      /(?:app|api|hono|router|route)?\s*\.\s*on\s*\(\s*(?:\[[^\]]+\]|['"`]([A-Za-z]+)['"`])\s*,\s*['"`]([^'"`]+)['"`]/i,
    method: (m) => (m[1] ?? "ANY").toUpperCase(),
    route: (m) => m[2] ?? "/",
  },
  {
    regex:
      /@(Get|Post|Put|Patch|Delete|All|Options|Head)\s*\(\s*['"`]?([^'"`]*)['"`]?\s*\)/i,
    method: (m) => m[1]!.toUpperCase(),
    route: (m) => {
      const p = m[2]?.trim() ?? "";
      return p ? (p.startsWith("/") ? p : `/${p}`) : "/";
    },
  },
  {
    regex: /http\.Handle(?:Func)?\s*\(\s*['"`]([^'"`]+)['"`]/,
    method: () => "ANY",
    route: (m) => m[1] ?? "/",
  },
  {
    regex: /mux\.Handle(?:Func)?\s*\(\s*['"`]([^'"`]+)['"`]/,
    method: () => "ANY",
    route: (m) => m[1] ?? "/",
  },
  {
    regex: /func\s+\(\s*\w+\s+\*\w+\)\s+\w+\(.*\*gin\.Context\)/,
    method: () => "ANY",
    route: () => "(Gin handler)",
  },
  {
    regex:
      /@(app|router|blueprint)\.(get|post|put|patch|delete|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/i,
    method: (m) => (m[2] ?? "ANY").toUpperCase(),
    route: (m) => m[3] ?? "/",
  },
  {
    regex:
      /Route::(get|post|put|patch|delete|options|any|match)\s*\(\s*['"`]([^'"`]+)['"`]/i,
    method: (m) => (m[1] ?? "ANY").toUpperCase(),
    route: (m) => m[2] ?? "/",
  },
  {
    regex: /#\[(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\]/i,
    method: (m) => (m[1] ?? "ANY").toUpperCase(),
    route: (m) => m[2] ?? "/",
  },
];

// MARK: - Scanner

export function scanEntryPoints(diff: GitDiff): PounceRouteChip[] {
  const chips: PounceRouteChip[] = [];
  const validFiles = new Set(
    diff.changedFiles.filter((f) => f.status !== "deleted").map((f) => f.path),
  );

  const lines = diff.rawPatch.split("\n");
  let inHunk = false;
  let currentFile = "";
  let lineNumber = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      const m = /b\/(.+)$/.exec(line);
      currentFile = m?.[1] ?? "";
      inHunk = false;
      continue;
    }

    if (!validFiles.has(currentFile)) continue;

    if (line.startsWith("@@")) {
      const m = /\+(\d+)/.exec(line);
      lineNumber = m ? parseInt(m[1]!, 10) - 1 : 0;
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith("-")) continue;

    if (!line.startsWith("+") && !line.startsWith(" ")) {
      inHunk = false;
      continue;
    }

    lineNumber++;

    if (!line.startsWith("+")) continue;

    const content = line.slice(1);

    for (const pattern of PATTERNS) {
      const match = pattern.regex.exec(content);
      if (match) {
        chips.push({
          method: pattern.method(match),
          route: pattern.route(match, currentFile),
          file: currentFile,
          line: lineNumber,
        });
        break;
      }
    }
  }

  for (const f of validFiles) {
    const isAlreadyCaptured = chips.some((c) => c.file === f);
    if (!isAlreadyCaptured) {
      const nextRouteMatch =
        /(?:apps\/[^/]+\/)?(?:src\/)?app\/(.+)\/route\.[a-zA-Z0-9]+$/.exec(f);
      if (nextRouteMatch && nextRouteMatch[1]) {
        chips.push({
          method: "ANY",
          route: `/${nextRouteMatch[1]}`,
          file: f,
        });
        continue;
      }
      const nextPageMatch =
        /(?:apps\/[^/]+\/)?(?:src\/)?app\/(.+)\/page\.[a-zA-Z0-9]+$/.exec(f);
      if (nextPageMatch && nextPageMatch[1]) {
        chips.push({
          method: "GET",
          route: `/${nextPageMatch[1]}`,
          file: f,
        });
        continue;
      }
      const rootPageMatch =
        /(?:apps\/[^/]+\/)?(?:src\/)?app\/page\.[a-zA-Z0-9]+$/.exec(f);
      if (rootPageMatch) {
        chips.push({
          method: "GET",
          route: "/",
          file: f,
        });
        continue;
      }
    }
  }

  return chips;
}

// MARK: - Mermaid Generator

export function buildMermaidDiagram(
  chips: PounceRouteChip[],
  modifiedFiles: string[],
): string {
  if (chips.length === 0 && modifiedFiles.length === 0) {
    return "graph TD\n  A[No entry points detected in diff]";
  }

  const lines: string[] = ["graph TD"];
  const fileToNodeId = new Map<string, string>();

  let fileIdx = 0;
  for (const f of modifiedFiles.slice(0, 10)) {
    const nodeId = `F_${fileIdx++}`;
    fileToNodeId.set(f, nodeId);
    const short = f.split("/").slice(-2).join("/");
    lines.push(`  ${nodeId}["${short}"]`);
  }

  const chipToNodeId = new Map<string, string>();
  let epIdx = 0;
  for (const chip of chips) {
    const key = `${chip.method} ${chip.route}:${chip.file}`;
    if (chipToNodeId.has(key)) continue;
    const epId = `EP_${epIdx++}`;
    chipToNodeId.set(key, epId);
    const label = `${chip.method} ${chip.route}`;
    lines.push(`  ${epId}["${label}"]`);

    const targetFileNode = fileToNodeId.get(chip.file);
    if (targetFileNode) {
      lines.push(`  ${epId} --> ${targetFileNode}`);
    } else if (fileToNodeId.size > 0) {
      const first = fileToNodeId.values().next().value;
      if (first) {
        lines.push(`  ${epId} --> ${first}`);
      }
    }
  }

  const nonRouteFiles = modifiedFiles.filter(
    (f) => !chips.some((c) => c.file === f),
  );
  const routeFiles = modifiedFiles.filter((f) =>
    chips.some((c) => c.file === f),
  );

  for (const rf of routeFiles) {
    const rfNode = fileToNodeId.get(rf);
    if (!rfNode) continue;
    for (const nrf of nonRouteFiles.slice(0, 5)) {
      const nrfNode = fileToNodeId.get(nrf);
      if (nrfNode) {
        lines.push(`  ${rfNode} --> ${nrfNode}`);
      }
    }
  }

  return lines.join("\n");
}

// MARK: - Per-Route Section Mermaid

export function buildRouteSectionMermaid(
  chip: PounceRouteChip,
  allChips: PounceRouteChip[],
  modifiedFiles: string[],
): string {
  const lines: string[] = ["graph TD"];

  const short = chip.file.split("/").slice(-2).join("/");
  lines.push(`  SRC["${short}"]`);
  lines.push(`  EP["${chip.method} ${chip.route}"]`);
  lines.push(`  EP --> SRC`);

  const siblings = allChips.filter(
    (c) =>
      c.file === chip.file &&
      `${c.method} ${c.route}` !== `${chip.method} ${chip.route}`,
  );
  let sibIdx = 0;
  for (const sib of siblings.slice(0, 4)) {
    const sibId = `SIB_${sibIdx++}`;
    lines.push(`  ${sibId}["${sib.method} ${sib.route}"]`);
    lines.push(`  ${sibId} --> SRC`);
  }

  const relatedFiles = modifiedFiles.filter(
    (f) => f !== chip.file && !allChips.some((c) => c.file === f),
  );
  let relIdx = 0;
  for (const rf of relatedFiles.slice(0, 4)) {
    const rfShort = rf.split("/").slice(-2).join("/");
    const rfId = `REL_${relIdx++}`;
    lines.push(`  ${rfId}["${rfShort}"]`);
    lines.push(`  SRC --> ${rfId}`);
  }

  return lines.join("\n");
}
