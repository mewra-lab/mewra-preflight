import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const output = join("artifacts", `${manifest.name}-${manifest.version}.vsix`);
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

mkdirSync("artifacts", { recursive: true });

const result = spawnSync(
  command,
  ["exec", "vsce", "package", "--no-dependencies", "--out", output],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
