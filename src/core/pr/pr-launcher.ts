import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PreFlightConfig } from "../../shared/types.js";

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

export type PRUrl = {
  url: string;
  branch: string;
};

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

  if (config.gitHost === "gitlab") {
    return {
      url: `${base}/-/merge_requests/new?merge_request[source_branch]=${encoded}&merge_request[target_branch]=${encodeURIComponent(config.targetBranch)}`,
      branch,
    };
  }

  return {
    url: `${base}/compare/${encodeURIComponent(config.targetBranch)}...${encoded}?expand=1`,
    branch,
  };
}
