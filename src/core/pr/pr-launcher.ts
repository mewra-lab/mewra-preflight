import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  PreFlightConfig,
  PreFlightSnapshot,
  PounceRouteChip,
} from "../../shared/types.js";
import { buildRouteSectionMermaid } from "../checks/packs/pounce/entry-point-scanner.js";
import { resolveTrustedTool } from "../checks/context.js";

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
  targetBranch: string;
  title: string;
  body: string;
};

type CommandOutput = {
  stdout: string;
  stderr: string;
};

type PRLauncherDependencies = {
  resolveTool?: (binName: string) => Promise<string | null>;
  runCommand?: (
    command: string,
    args: string[],
    cwd: string,
  ) => Promise<CommandOutput>;
};

export type PushResult = { ok: true } | { ok: false };

export type GitLabPushResult = { ok: true; url: string | null } | { ok: false };

export type GitHubPullRequestResult = {
  kind: "created" | "existing";
  url: string;
};

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandOutput> {
  const { stdout, stderr } = await execFileAsync(command, args, { cwd });
  return { stdout, stderr };
}

function outputUrl(stdout: string): string | null {
  return (
    stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^https:\/\//.test(line)) ?? null
  );
}

function launcherDependencies(
  workspaceRoot: string,
  dependencies: PRLauncherDependencies,
) {
  return {
    resolveTool:
      dependencies.resolveTool ??
      ((binName: string) => resolveTrustedTool(workspaceRoot, binName)),
    runCommand: dependencies.runCommand ?? runCommand,
  };
}

/** Pushes the current branch using a trusted Git executable. */
export async function pushCurrentBranch(
  workspaceRoot: string,
  branch: string,
  dependencies: PRLauncherDependencies = {},
): Promise<PushResult> {
  const { resolveTool, runCommand: execute } = launcherDependencies(
    workspaceRoot,
    dependencies,
  );
  const git = await resolveTool("git");
  if (!git) return { ok: false };

  try {
    await execute(
      git,
      ["push", "--set-upstream", "origin", branch],
      workspaceRoot,
    );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function mergeRequestUrl(output: string): string | null {
  return output.match(/https:\/\/\S+\/-\/merge_requests\/\d+/)?.[0] ?? null;
}

/**
 * Pushes a branch and asks GitLab to create its merge request server-side.
 * Git push options avoid browser URL-size limits for generated descriptions.
 */
export async function pushGitLabMergeRequest(
  workspaceRoot: string,
  draft: PRUrl,
  dependencies: PRLauncherDependencies = {},
): Promise<GitLabPushResult> {
  const { resolveTool, runCommand: execute } = launcherDependencies(
    workspaceRoot,
    dependencies,
  );
  const git = await resolveTool("git");
  if (!git) return { ok: false };

  try {
    const result = await execute(
      git,
      [
        "push",
        "--set-upstream",
        "-o",
        "merge_request.create",
        "-o",
        `merge_request.target=${draft.targetBranch}`,
        "-o",
        `merge_request.title=${draft.title}`,
        "-o",
        `merge_request.description=${draft.body}`,
        "origin",
        draft.branch,
      ],
      workspaceRoot,
    );
    return {
      ok: true,
      url: mergeRequestUrl(`${result.stdout}\n${result.stderr}`),
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Creates a GitHub pull request through the user's authenticated GitHub CLI.
 * A null result lets the caller use the browser-based fallback instead.
 */
export async function createGitHubPullRequest(
  workspaceRoot: string,
  draft: PRUrl,
  dependencies: PRLauncherDependencies = {},
): Promise<GitHubPullRequestResult | null> {
  const { resolveTool, runCommand: execute } = launcherDependencies(
    workspaceRoot,
    dependencies,
  );
  const gh = await resolveTool("gh");
  if (!gh) return null;

  try {
    const existing = await execute(
      gh,
      [
        "pr",
        "list",
        "--head",
        draft.branch,
        "--state",
        "open",
        "--json",
        "url",
        "--jq",
        ".[0].url",
      ],
      workspaceRoot,
    );
    const url = outputUrl(existing.stdout);
    if (url) return { kind: "existing", url };
  } catch {
    // No PR exists yet, or the CLI cannot query it. Try creating the draft.
  }

  try {
    const created = await execute(
      gh,
      [
        "pr",
        "create",
        "--base",
        draft.targetBranch,
        "--head",
        draft.branch,
        "--title",
        draft.title,
        "--body",
        draft.body,
      ],
      workspaceRoot,
    );
    const url = outputUrl(created.stdout);
    return url ? { kind: "created", url } : null;
  } catch {
    return null;
  }
}

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
      targetBranch: config.targetBranch,
      title,
      body,
    };
  }

  return {
    url: `${base}/compare/${encodeURIComponent(config.targetBranch)}...${encoded}?quick_pull=1&expand=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
    branch,
    targetBranch: config.targetBranch,
    title,
    body,
  };
}
