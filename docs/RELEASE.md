# Mewra PreFlight — Release and Distribution

## 1. Release targets

- Visual Studio Code Marketplace
- Open VSX Registry
- GitHub Releases as a `.vsix` artifact (with SHA-256 checksum)

## 2. Versioning

Semantic Versioning:

```text
0.1.0  — initial release: diff-scoped runner, polyglot packs (JS/TS, Python, Go, PHP), universal checks, custom packs, interactive manual checklist, MCP server
0.2.0  — Mewra Pounce route summary (changed route declarations in dashboard/PR), .preflightignore per-folder check-pack overrides
0.3.0  — first-party contributed packs: Dependency Guard (OSV/Trivy CVE scan), ORM Cost Sentry, Style Guardian; local trend & history tracking
1.0.0  — Mewra Drift integration, automated git pre-push hook installer, production-stable release across VS Code Marketplace & Open VSX
```

## 3. Pre-release checks

```bash
pnpm install --frozen-lockfile
pnpm validate
```

Security checks:

- Webview CSP reviewed (nonce-only scripts, no `unsafe-inline`);
- message validation tests pass;
- `child_process` calls use fixed argument arrays;
- dependency audit reviewed;
- secret scan clean;
- VSIX contents inspected.

## 4. Package inspection

The VSIX must include:

- `dist/extension.cjs`
- `dist/webview/index.js`
- `dist/webview/assets/styles.css`
- `dist/webview/assets/mewra-logo.svg`
- `assets/brand/`
- `schemas/preflight.schema.json`
- `package.json`, `README.md`, `LICENSE`

The VSIX must **not** include:

- `.agents/`, `tests/`, `coverage/`, `node_modules/`;
- `.env` files or credentials;
- source maps in production package (`.map` files excluded by `.vscodeignore`).

## 5. Quality commands

```bash
pnpm install --frozen-lockfile
pnpm validate
```

## 6. Changelog

### v0.2.0

**Mewra Pounce Route Summary & `.preflightignore`**

- **Pounce Route Summary Check** (`pounce:blast-radius`): New built-in check that detects route declarations in modified Next.js (App Router route handlers), Express/Fastify, Go `net/http`/mux/gin, Python (Flask, FastAPI, Django), and PHP (Laravel, Symfony) files. It surfaces route chips and Mermaid route/file summaries in the dashboard.
- **Mermaid PR Attachment**: `formatPRBody` now auto-injects a collapsible `<details open>` block with a per-route Mermaid summary into the generated PR draft body whenever a check result includes route metadata.
- **Route Chips UI**: `check-row` component renders colour-coded HTTP method/path chips (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) and a blast-radius badge for pounce pack checks.
- **`.preflightignore` Integration**: The pipeline now loads `.preflightignore` from the workspace root before running checks and filters the computed diff accordingly. File-level glob ignores (`dist/**`, `fixtures/**`) and per-check/pack targeted ignores (`scripts/**: universal:no-console-log`) are both supported.
- **`enabledPacks` config extended**: Added `"pounce"` to the valid values for `mewraPreflight.enabledPacks` in `package.json` schema.
- **Shared types extended**: `CheckResult` now carries optional `mermaid: string` and `routes: PounceRouteChip[]` fields, validated by Zod schemas.
- **Tests**: Unit coverage for route detection, Mermaid generation, `.preflightignore`, runner filtering, and PR-body generation.

### v0.1.0

Initial release: diff-scoped runner, polyglot packs (JS/TS, Python, Go, PHP), universal checks, custom packs, interactive manual checklist, MCP server.
