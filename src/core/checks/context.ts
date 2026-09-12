import { access, constants } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PreFlightContext, CommandResult } from "./check-contract.js";

// MARK: - Helpers

const execFileAsync = promisify(execFile);

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// MARK: - Implementation

export function createPreFlightContext(
  workspaceRoot: string,
): PreFlightContext {
  return {
    workspaceRoot,

    async resolveTool(binName: string): Promise<string | null> {
      let currentDir = workspaceRoot;
      while (true) {
        const localBin = resolve(currentDir, "node_modules", ".bin", binName);
        if (await isExecutable(localBin)) {
          return localBin;
        }
        const parent = resolve(currentDir, "..");
        if (parent === currentDir) break;
        currentDir = parent;
      }

      const lookupCmd = process.platform === "win32" ? "where" : "which";
      try {
        const { stdout } = await execFileAsync(lookupCmd, [binName]);
        const resolved = stdout.trim().split("\n")[0]?.trim();
        if (resolved && resolved.length > 0) return resolved;
      } catch {}

      if (process.platform !== "win32") {
        const home = process.env.HOME ?? "";
        const commonPaths = [
          `/opt/homebrew/bin/${binName}`,
          `/usr/local/bin/${binName}`,
          `${home}/.nvm/current/bin/${binName}`,
          `${home}/.pnpm/${binName}`,
          `${home}/.local/bin/${binName}`,
          `/usr/bin/${binName}`,
        ];
        for (const p of commonPaths) {
          if (await isExecutable(p)) {
            return p;
          }
        }
      }

      return null;
    },

    async runCommand(
      cmd: string,
      args: string[],
      cwd?: string,
    ): Promise<CommandResult> {
      try {
        const { stdout, stderr } = await execFileAsync(cmd, args, {
          cwd: cwd ?? workspaceRoot,
        });
        return { stdout, stderr, code: 0 };
      } catch (err: unknown) {
        const error = err as {
          stdout?: string;
          stderr?: string;
          code?: number;
        };
        return {
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? "",
          code: typeof error.code === "number" ? error.code : 1,
        };
      }
    },
  };
}
