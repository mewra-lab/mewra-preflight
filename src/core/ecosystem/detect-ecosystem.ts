import { access } from "node:fs/promises";
import { join } from "node:path";

export type Ecosystem = "js-ts" | "python" | "go" | "php" | "unknown";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function detectEcosystem(
  workspaceRoot: string,
): Promise<Ecosystem> {
  const [hasPackageJson, hasGoMod, hasPyproject, hasComposerJson] =
    await Promise.all([
      exists(join(workspaceRoot, "package.json")),
      exists(join(workspaceRoot, "go.mod")),
      exists(join(workspaceRoot, "pyproject.toml")),
      exists(join(workspaceRoot, "composer.json")),
    ]);

  if (hasPackageJson) return "js-ts";
  if (hasGoMod) return "go";
  if (hasPyproject) return "python";
  if (hasComposerJson) return "php";
  return "unknown";
}
