import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { GitDiff } from "../../shared/types.js";

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

async function checkContainerDirectories(
  workspaceRoot: string,
  active: Set<Ecosystem>,
): Promise<void> {
  const containerDirs = ["apps", "packages", "services", "modules", "libs"];
  for (const dir of containerDirs) {
    try {
      const fullDir = join(workspaceRoot, dir);
      const entries = await readdir(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sub = join(fullDir, entry.name);
        if (!active.has("js-ts")) {
          const hasJs =
            (await exists(join(sub, "package.json"))) ||
            (await exists(join(sub, "tsconfig.json")));
          if (hasJs) active.add("js-ts");
        }
        if (!active.has("python")) {
          const hasPy =
            (await exists(join(sub, "pyproject.toml"))) ||
            (await exists(join(sub, "requirements.txt"))) ||
            (await exists(join(sub, "setup.py"))) ||
            (await exists(join(sub, "uv.lock")));
          if (hasPy) active.add("python");
        }
        if (!active.has("go")) {
          const hasGo = await exists(join(sub, "go.mod"));
          if (hasGo) active.add("go");
        }
        if (!active.has("php")) {
          const hasPhp = await exists(join(sub, "composer.json"));
          if (hasPhp) active.add("php");
        }
      }
    } catch {}
  }
}

// MARK: - Detectors

export async function detectActiveEcosystems(
  workspaceRoot: string,
  diff?: GitDiff,
): Promise<Ecosystem[]> {
  const [hasJsTs, hasGo, hasPython, hasPhp] = await Promise.all([
    anyExists(workspaceRoot, [
      "package.json",
      "pnpm-workspace.yaml",
      "pnpm-lock.yaml",
      "yarn.lock",
      "package-lock.json",
      "bun.lockb",
      "turbo.json",
      "lerna.json",
      "tsconfig.json",
      "jsconfig.json",
      "deno.json",
      "biome.json",
      "apps/web/package.json",
      "apps/frontend/package.json",
      "apps/client/package.json",
      "apps/app/package.json",
      "packages/web/package.json",
      "packages/ui/package.json",
      "packages/core/package.json",
      "web/package.json",
      "frontend/package.json",
      "client/package.json",
      "ui/package.json",
    ]),
    anyExists(workspaceRoot, [
      "go.mod",
      "go.sum",
      "main.go",
      "backend/go.mod",
      "api/go.mod",
      "server/go.mod",
      "cmd/main.go",
    ]),
    anyExists(workspaceRoot, [
      "pyproject.toml",
      "uv.lock",
      "poetry.lock",
      "Pipfile",
      "Pipfile.lock",
      "requirements.txt",
      "requirements-dev.txt",
      "setup.py",
      "setup.cfg",
      "environment.yml",
      ".python-version",
      "main.py",
      "manage.py",
      "wsgi.py",
      "asgi.py",
      "backend/pyproject.toml",
      "backend/requirements.txt",
      "api/pyproject.toml",
      "api/requirements.txt",
      "server/pyproject.toml",
      "server/requirements.txt",
    ]),
    anyExists(workspaceRoot, [
      "composer.json",
      "composer.lock",
      "artisan",
      "index.php",
      "backend/composer.json",
      "api/composer.json",
      "server/composer.json",
    ]),
  ]);

  const active = new Set<Ecosystem>();
  if (hasJsTs) active.add("js-ts");
  if (hasGo) active.add("go");
  if (hasPython) active.add("python");
  if (hasPhp) active.add("php");

  await checkContainerDirectories(workspaceRoot, active);

  if (diff) {
    for (const file of diff.changedFiles) {
      if (file.status === "deleted") continue;
      const path = file.path.toLowerCase();
      if (/\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro)$/.test(path)) {
        active.add("js-ts");
      } else if (/\.(py|pyi)$/.test(path)) {
        active.add("python");
      } else if (/\.go$/.test(path)) {
        active.add("go");
      } else if (/\.php$/.test(path)) {
        active.add("php");
      }
    }
  }

  const order: Ecosystem[] = ["js-ts", "python", "go", "php"];
  return order.filter((eco) => active.has(eco));
}

export async function detectEcosystem(
  workspaceRoot: string,
  diff?: GitDiff,
): Promise<Ecosystem> {
  const active = await detectActiveEcosystems(workspaceRoot, diff);
  return active[0] ?? "unknown";
}
