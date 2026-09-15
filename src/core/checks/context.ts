import { access, constants, realpath, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
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

function isInsideWorkspace(workspaceRoot: string, candidate: string): boolean {
  const workspaceRelative = relative(workspaceRoot, candidate);
  return (
    (workspaceRelative === "" ||
      workspaceRelative === ".." ||
      workspaceRelative.startsWith(`..${sep}`) ||
      isAbsolute(workspaceRelative)) === false
  );
}

async function trustedExecutablePath(
  workspaceRoot: string,
  candidate: string,
): Promise<string | null> {
  try {
    const [realWorkspaceRoot, realCandidate] = await Promise.all([
      realpath(workspaceRoot),
      realpath(candidate),
    ]);
    if (isInsideWorkspace(realWorkspaceRoot, realCandidate)) return null;
    return (await isExecutable(realCandidate)) ? realCandidate : null;
  } catch {
    return null;
  }
}

export async function resolveTrustedTool(
  workspaceRoot: string,
  binName: string,
  additionalCandidates: string[] = [],
): Promise<string | null> {
  const home = process.env.HOME ?? "";
  const userProfile = process.env.USERPROFILE ?? "";
  const programFiles = process.env.ProgramFiles ?? "";
  const executableName =
    process.platform === "win32" ? `${binName}.exe` : binName;
  const userTrustedCandidates = home
    ? [
        resolve(home, ".local", "bin", executableName),
        resolve(home, ".cargo", "bin", executableName),
        resolve(home, "go", "bin", executableName),
        resolve(home, ".composer", "vendor", "bin", executableName),
        resolve(home, ".config", "composer", "vendor", "bin", executableName),
        `${home}/.nvm/current/bin/${executableName}`,
        `${home}/.pnpm/${executableName}`,
      ]
    : [];
  const windowsTrustedCandidates =
    process.platform === "win32" && userProfile
      ? [
          resolve(userProfile, ".cargo", "bin", executableName),
          resolve(userProfile, "scoop", "shims", executableName),
          resolve(userProfile, "go", "bin", executableName),
        ]
      : [];
  const windowsSystemCandidates =
    process.platform === "win32" && programFiles
      ? [
          resolve(
            programFiles,
            "Docker",
            "Docker",
            "resources",
            "bin",
            executableName,
          ),
          resolve(programFiles, "Trivy", executableName),
          resolve(programFiles, "osv-scanner", executableName),
        ]
      : [];
  const trustedCandidates = [
    ...additionalCandidates,
    ...userTrustedCandidates,
    ...windowsTrustedCandidates,
    ...windowsSystemCandidates,
    `/opt/homebrew/bin/${executableName}`,
    `/usr/local/bin/${executableName}`,
    `/usr/local/go/bin/${executableName}`,
    `/usr/bin/${executableName}`,
  ];

  for (const candidate of trustedCandidates) {
    const trustedPath = await trustedExecutablePath(workspaceRoot, candidate);
    if (trustedPath) return trustedPath;
  }

  return null;
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

      const commonSubCandidates = [
        resolve(workspaceRoot, "apps", "web", "node_modules", ".bin", binName),
        resolve(
          workspaceRoot,
          "apps",
          "frontend",
          "node_modules",
          ".bin",
          binName,
        ),
        resolve(
          workspaceRoot,
          "apps",
          "client",
          "node_modules",
          ".bin",
          binName,
        ),
        resolve(workspaceRoot, "web", "node_modules", ".bin", binName),
        resolve(workspaceRoot, "frontend", "node_modules", ".bin", binName),
        resolve(workspaceRoot, "client", "node_modules", ".bin", binName),
        resolve(workspaceRoot, "backend", ".venv", "bin", binName),
        resolve(workspaceRoot, "api", ".venv", "bin", binName),
        resolve(workspaceRoot, "server", ".venv", "bin", binName),
        resolve(workspaceRoot, "backend", "vendor", "bin", binName),
      ];
      for (const candidate of commonSubCandidates) {
        if (await isExecutable(candidate)) {
          return candidate;
        }
      }

      for (const parentSub of ["apps", "packages", "services", "modules"]) {
        try {
          const parentPath = resolve(workspaceRoot, parentSub);
          const entries = await readdir(parentPath, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const nestedNodeBin = resolve(
              parentPath,
              entry.name,
              "node_modules",
              ".bin",
              binName,
            );
            if (await isExecutable(nestedNodeBin)) {
              return nestedNodeBin;
            }
            const nestedVenvBin = resolve(
              parentPath,
              entry.name,
              ".venv",
              "bin",
              binName,
            );
            if (await isExecutable(nestedVenvBin)) {
              return nestedVenvBin;
            }
          }
        } catch {}
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

    resolveTrustedTool: (binName) => resolveTrustedTool(workspaceRoot, binName),

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
