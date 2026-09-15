import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  PreFlightConfig,
  PreFlightSnapshot,
  PounceRouteChip,
} from "../../shared/types.js";
import { buildRouteSectionMermaid } from "../checks/packs/pounce/entry-point-scanner.js";

// MARK: - Helpers

const execFileAsync = promisify(execFile);

async function getRemoteUrl(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["remote", "get-url", "origin"],
      { cwd },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getGitCommits(
  cwd: string,
  targetBranch: string,
): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "--oneline", "-n", "20", `${targetBranch}..HEAD`],
      { cwd },
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function remoteToHttps(remoteUrl: string): string {
  return remoteUrl
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "");
}

export function formatBranchTitle(branch: string): string {
  if (branch.includes("/")) {
    const [prefix, ...rest] = branch.split("/");
    return `${prefix}: ${rest.join("/").replace(/[-_]/g, " ")}`;
  }
  return branch.replace(/[-_]/g, " ");
}

export function formatPRBody(
  branch: string,
  targetBranch: string,
  commits: string[],
  snapshot?: PreFlightSnapshot,
): string {
  const sections: string[] = [
    "Summary",
    "-------",
    "Automated PR draft created by Mewra PreFlight.",
    "",
    `- Source branch: \`${branch}\``,
    `- Target branch: \`${targetBranch}\``,
  ];

  if (commits.length > 0) {
    if (commits.length > 5) {
      sections.push(
        "",
        "Commits",
        "-------",
        "",
        "<details>",
        `<summary>View all ${commits.length} commits</summary>`,
        "",
        ...commits.map((c) => `- ${c}`),
        "",
        "</details>",
      );
    } else {
      sections.push("", "Commits", "-------", ...commits.map((c) => `- ${c}`));
    }
  }

  if (snapshot) {
    sections.push(
      "",
      "PreFlight Sanity Checks",
      "-----------------------",
      `- Overall Status: **${snapshot.overallStatus.toUpperCase()}**`,
    );

    const checksWithFindings = snapshot.checks.filter(
      (c) => c.result.findings && c.result.findings.length > 0,
    );

    if (checksWithFindings.length > 0) {
      sections.push(
        "",
        "<details>",
        "<summary>Check Findings Details</summary>",
        "",
      );
      for (const check of checksWithFindings) {
        sections.push(`**${check.definition.label} (${check.result.status})**`);
        for (const f of check.result.findings) {
          const loc = f.line ? `:${f.line}` : "";
          sections.push(`- \`${f.file}${loc}\`: ${f.message}`);
        }
      }
      sections.push("</details>");
    }

    const pounceChecks = snapshot.checks.filter(
      (c) => (c.result.routes?.length ?? 0) > 0,
    );

    if (pounceChecks.length > 0) {
      sections.push(
        "",
        "Blast Radius — Impacted Entry Points",
        "-------------------------------------",
      );

      const modifiedFiles =
        snapshot.diff?.changedFiles
          .filter((f) => f.status !== "deleted")
          .map((f) => f.path) ?? [];

      for (const check of pounceChecks) {
        const allChips: PounceRouteChip[] = check.result.routes ?? [];
        const seen = new Set<string>();
        const uniqueChips = allChips.filter((chip) => {
          const key = `${chip.method} ${chip.route} ${chip.file}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        for (const chip of uniqueChips.slice(0, 10)) {
          const locLabel = chip.line ? `:${chip.line}` : "";
          const fileLabel = chip.file.split("/").slice(-2).join("/");
          const diagram = buildRouteSectionMermaid(
            chip,
            allChips,
            modifiedFiles,
          );
          sections.push(
            "",
            "<details open>",
            `<summary><code>${chip.method} ${chip.route}</code> — ${fileLabel}${locLabel}</summary>`,
            "",
            "```mermaid",
            diagram,
            "```",
            "",
            "</details>",
          );
        }
      }
    }
  }

  return sections.join("\n") + "\n";
}

// MARK: - Types

export type PRUrl = {
  url: string;
  branch: string;
  title: string;
  body: string;
};

// MARK: - Launcher

export async function buildPRUrl(
  workspaceRoot: string,
  config: PreFlightConfig,
  snapshot?: PreFlightSnapshot,
): Promise<PRUrl | null> {
  const [remoteUrl, branch] = await Promise.all([
    getRemoteUrl(workspaceRoot),
    getCurrentBranch(workspaceRoot),
  ]);

  if (!remoteUrl || !branch) return null;
  if (branch === "HEAD" || branch === config.targetBranch) return null;

  const commits = await getGitCommits(workspaceRoot, config.targetBranch);
  const base = remoteToHttps(remoteUrl);
  const encoded = encodeURIComponent(branch);
  const title = formatBranchTitle(branch);
  const body = formatPRBody(branch, config.targetBranch, commits, snapshot);

  if (config.gitHost === "gitlab") {
    return {
      url: `${base}/-/merge_requests/new?merge_request[source_branch]=${encoded}&merge_request[target_branch]=${encodeURIComponent(config.targetBranch)}&merge_request[title]=${encodeURIComponent(title)}&merge_request[description]=${encodeURIComponent(body)}`,
      branch,
      title,
      body,
    };
  }

  return {
    url: `${base}/compare/${encodeURIComponent(config.targetBranch)}...${encoded}?quick_pull=1&expand=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
    branch,
    title,
    body,
  };
}
