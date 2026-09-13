# Mewra PreFlight — Release and Distribution

## 1. Release targets

- Visual Studio Code Marketplace
- Open VSX Registry
- GitHub Releases as a `.vsix` artifact (with SHA-256 checksum)

## 2. Versioning

Semantic Versioning:

```text
0.1.0  — initial release: diff-scoped runner, polyglot packs (JS/TS, Python, Go, PHP), universal checks, custom packs, interactive manual checklist, MCP server
0.2.0  — Mewra Pounce integration (blast radius & affected routes in dashboard/PR), .preflightignore per-folder pack overrides
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
