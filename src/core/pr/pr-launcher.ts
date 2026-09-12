import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PreFlightConfig } from "../../shared/types.js";

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

function remoteToHttps(remoteUrl: string): string {
  return remoteUrl
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "");
}

function formatBranchTitle(branch: string): string {
  if (branch.includes("/")) {
    const [prefix, ...rest] = branch.split("/");
    return `${prefix}: ${rest.join("/").replace(/[-_]/g, " ")}`;
  }
  return branch.replace(/[-_]/g, " ");
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
): Promise<PRUrl | null> {
  const [remoteUrl, branch] = await Promise.all([
    getRemoteUrl(workspaceRoot),
    getCurrentBranch(workspaceRoot),
  ]);

  if (!remoteUrl || !branch) return null;
  if (branch === "HEAD" || branch === config.targetBranch) return null;

  const base = remoteToHttps(remoteUrl);
  const encoded = encodeURIComponent(branch);
  const title = formatBranchTitle(branch);
  const body = `## Summary\n\nAutomated PR draft created by Mewra PreFlight.\n\n- Source branch: \`${branch}\`\n- Target branch: \`${config.targetBranch}\`\n`;

  if (config.gitHost === "gitlab") {
    return {
      url: `${base}/-/merge_requests/new?merge_request[source_branch]=${encoded}&merge_request[target_branch]=${encodeURIComponent(config.targetBranch)}&merge_request[title]=${encodeURIComponent(title)}&merge_request[description]=${encodeURIComponent(body)}`,
      branch,
      title,
      body,
    };
  }

  return {
    url: `${base}/compare/${encodeURIComponent(config.targetBranch)}...${encoded}?expand=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
    branch,
    title,
    body,
  };
}
