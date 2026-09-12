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
        const localCandidates = [
          resolve(currentDir, "node_modules", ".bin", binName),
          resolve(currentDir, "vendor", "bin", binName),
          resolve(currentDir, "vendor", "bin", `${binName}.bat`),
          resolve(currentDir, ".venv", "bin", binName),
          resolve(currentDir, "venv", "bin", binName),
          resolve(currentDir, "env", "bin", binName),
          resolve(currentDir, ".venv", "Scripts", `${binName}.exe`),
          resolve(currentDir, "venv", "Scripts", `${binName}.exe`),
        ];
        for (const candidate of localCandidates) {
          if (await isExecutable(candidate)) {
            return candidate;
          }
        }
        const parent = resolve(currentDir, "..");
        if (parent === currentDir) break;
        currentDir = parent;
      }

      const home = process.env.HOME ?? "";
      const userBinCandidates = [
        resolve(home, ".local", "bin", binName),
        resolve(home, ".cargo", "bin", binName),
        resolve(home, "go", "bin", binName),
        resolve(home, ".composer", "vendor", "bin", binName),
        resolve(home, ".config", "composer", "vendor", "bin", binName),
      ];
      for (const candidate of userBinCandidates) {
        if (await isExecutable(candidate)) {
          return candidate;
        }
      }

      const lookupCmd = process.platform === "win32" ? "where" : "which";
      try {
        const { stdout } = await execFileAsync(lookupCmd, [binName]);
        const resolved = stdout.trim().split("\n")[0]?.trim();
        if (resolved && resolved.length > 0) return resolved;
      } catch {}

      if (process.platform !== "win32") {
        const commonPaths = [
          `/opt/homebrew/bin/${binName}`,
          `/usr/local/bin/${binName}`,
          `/usr/local/go/bin/${binName}`,
          `${home}/.nvm/current/bin/${binName}`,
          `${home}/.pnpm/${binName}`,
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
      timeoutMs = 30_000,
    ): Promise<CommandResult> {
      try {
        const { stdout, stderr } = await execFileAsync(cmd, args, {
          cwd: cwd ?? workspaceRoot,
          timeout: timeoutMs,
        });
        return { stdout, stderr, code: 0 };
      } catch (err: unknown) {
        const error = err as {
          stdout?: string;
          stderr?: string;
          code?: number | string;
          killed?: boolean;
          signal?: string;
        };

        const isTimeout =
          error.killed ||
          error.code === "ETIMEDOUT" ||
          error.signal === "SIGTERM";
        const stderr = isTimeout ? "Command timed out." : (error.stderr ?? "");

        return {
          stdout: error.stdout ?? "",
          stderr,
          code: typeof error.code === "number" ? error.code : 1,
        };
      }
    },
  };
}
