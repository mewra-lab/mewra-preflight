import { cp, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dest = join(root, "dist", "webview", "assets");

await mkdir(dest, { recursive: true });

await cp(
  join(root, "assets", "brand", "mewra-logo.svg"),
  join(dest, "mewra-logo.svg"),
);
await cp(
  join(root, "assets", "brand", "mewra-dark.svg"),
  join(dest, "mewra-dark.svg"),
);
await cp(join(root, "assets", "brand", "icon.png"), join(dest, "icon.png"));
await cp(
  join(root, "assets", "brand", "preflight-icon.svg"),
  join(dest, "preflight-icon.svg"),
);
await cp(
  join(root, "assets", "brand", "preflight-icon-dark.svg"),
  join(dest, "preflight-icon-dark.svg"),
);
await cp(
  join(root, "assets", "brand", "preflight-icon-light.svg"),
  join(dest, "preflight-icon-light.svg"),
);
await cp(
  join(root, "assets", "brand", "preflight-icon-dark.png"),
  join(dest, "preflight-icon-dark.png"),
);
await cp(
  join(root, "assets", "brand", "preflight-icon-light.png"),
  join(dest, "preflight-icon-light.png"),
);
await cp(join(root, "src", "webview", "styles.css"), join(dest, "styles.css"));
