import { access } from "node:fs/promises";
import { join } from "node:path";

// MARK: - Types

export type Ecosystem = "js-ts" | "python" | "go" | "php" | "unknown";

// MARK: - Helpers

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function anyExists(
  workspaceRoot: string,
  files: string[],
): Promise<boolean> {
  const checks = await Promise.all(
    files.map((file) => exists(join(workspaceRoot, file))),
  );
  return checks.some(Boolean);
}

// MARK: - Detectors

export async function detectActiveEcosystems(
  workspaceRoot: string,
): Promise<Ecosystem[]> {
  const [hasJsTs, hasGo, hasPython, hasPhp] = await Promise.all([
    anyExists(workspaceRoot, ["package.json"]),
    anyExists(workspaceRoot, ["go.mod", "go.sum"]),
    anyExists(workspaceRoot, [
      "pyproject.toml",
      "uv.lock",
      "requirements.txt",
      "Pipfile",
      "setup.py",
    ]),
    anyExists(workspaceRoot, ["composer.json"]),
  ]);

  const active: Ecosystem[] = [];
  if (hasJsTs) active.push("js-ts");
  if (hasGo) active.push("go");
  if (hasPython) active.push("python");
  if (hasPhp) active.push("php");

  return active;
}

export async function detectEcosystem(
  workspaceRoot: string,
): Promise<Ecosystem> {
  const active = await detectActiveEcosystems(workspaceRoot);
  return active[0] ?? "unknown";
}
