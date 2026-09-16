# Mewra PreFlight — Architecture

## 1. Architectural goals

Mewra PreFlight must remain:

- deterministic and local-first (no AI or background network calls);
- tool-agnostic at the core (check packs registered per ecosystem, not spread through logic);
- safe when handling untrusted Webview messages;
- gracefully degraded when tools are missing (`not-configured`, never `failed`);
- testable without a live VS Code host for pure logic modules.

## 2. High-level architecture

```text
VS Code Workbench
│
├── Commands / Keybindings
│
├── Extension Host (TypeScript)
│   ├── extension.ts               — activation, command registration
│   ├── PreFlightPanel             — WebviewPanel lifecycle + message bridge
│   │
│   ├── Core
│   │   ├── diff/
│   │   │   └── git-diff.ts        — git diff computation via child_process
│   │   ├── checks/
│   │   │   ├── check-contract.ts  — CheckRunner interface
│   │   │   ├── runner.ts          — parallel check execution engine
│   │   │   └── packs/
│   │   │       ├── universal/     — language-agnostic checks
│   │   │       ├── js-ts/         — JS/TS ecosystem checks
│   │   │       ├── go/            — Go ecosystem checks (gofmt, go vet, golangci-lint)
│   │   │       ├── python/        — Python ecosystem checks (ruff, black, flake8, mypy)
│   │   │       ├── php/           — PHP ecosystem checks (php-cs-fixer, phpstan/psalm, test-pairing)
│   │   │       ├── orm-cost-sentry/ — query-in-loop and destructive-migration heuristics
│   │   │       ├── style-guardian/ — Tailwind utility conflict detection
│   │   │       └── custom/        — Community JSON-based custom pack runner
│   │   ├── ecosystem/
│   │   │   └── detect-ecosystem.ts
│   │   └── pr/
│   │       ├── pr-launcher.ts     — GitHub PR / GitLab MR creator with browser fallback
│   │       └── route-mermaid.ts   — generic route-summary Mermaid renderer
│   │
│   └── security/
│       └── nonce.ts
│
└── Webview UI (Preact + TypeScript)
    ├── App                        — state machine, header, checks list
    ├── CheckRow                   — per-check status row with findings
    ├── PrButton                   — PR launch button (blocked/ready)
    └── styles.css                 — VS Code theme variable tokens
```

## 3. Repository structure

```text
mewra-preflight/
├── assets/brand/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── GIT-WORKFLOW.md
│   ├── TESTING.md
│   ├── UX.md
│   ├── RELEASE.md
│   └── decisions/
├── scripts/
│   ├── clean.mjs
│   └── copy-assets.mjs
├── src/
│   ├── extension/
│   │   ├── extension.ts
│   │   ├── preflight-panel.ts
│   │   └── security/nonce.ts
│   ├── core/
│   │   ├── diff/git-diff.ts
│   │   ├── config/workspace-config.ts
│   │   ├── checks/
│   │   │   ├── check-contract.ts
│   │   │   ├── context.ts
│   │   │   ├── runner.ts
│   │   │   ├── manual-evaluator.ts
│   │   │   └── packs/{universal,js-ts,go,python,php,orm-cost-sentry,style-guardian,custom}/
│   │   ├── ecosystem/detect-ecosystem.ts
│   │   ├── config/preflight-ignore.ts — global and per-check/pack diff filtering
│   │   ├── mcp/handler.ts
│   │   └── pr/pr-launcher.ts
│   ├── shared/
│   │   ├── types.ts
│   │   └── messages.ts
│   └── webview/
│       ├── index.tsx
│       ├── app.tsx
│       ├── components/{check-row.tsx,manual-checklist.tsx,pr-button.tsx}
│       └── styles.css
├── tests/unit/
├── SPEC.md
├── AGENTS.md
├── package.json
├── tsconfig.json
└── pnpm-workspace.yaml
```

## 4. Trust boundary

```text
Preact Webview
   │ unknown message (postMessage)
   ▼
Zod schema (WebviewMessageSchema)
   │
   ▼
PreFlightPanel (Extension Host)
   │
   ▼
runChecks → CheckRunner[] → child_process (fixed args)
   │
   ▼
Snapshot → PostMessage (validated) → Webview
```

## 5. Check pack contract

Each check pack exposes a `build<Pack>Pack(): CheckRunner[]` factory (or `buildCustomChecks` for community JSON-based packs). A `CheckRunner` must:

- declare `id`, `label`, `severity`, `pack`;
- implement `appliesTo(diff): boolean` to decide if it should run against the diff;
- implement `run(diff, context): Promise<CheckResult>`;
- return `not-configured` (not `fail`) when the underlying tool is absent;
- use fixed argument arrays in all `child_process` calls.

Before a check runs, `.preflightignore` rules filter its `GitDiff` input. Global rules remove paths for every consumer, while targeted rules remove paths only for the named check or pack.

Installed companion extensions receive the versioned `MewraPreFlightAPI` through `vscode.extensions.getExtension(...).activate()`. The host applies `.mewra-preflight.json` `contributedChecks` enablement and severity controls before dashboard or MCP execution. Check IDs are deduplicated at execution time as a final defensive boundary, so an accidental duplicate contribution cannot run twice or render duplicate dashboard rows.

## 6. MCP bridge

PreFlight registers a native VS Code MCP server definition provider. Its local
HTTP bridge runs only on `127.0.0.1` with an ephemeral port and a random bearer
token supplied only through the VS Code server definition. It never exposes a
workspace path, shell, arbitrary command, or public network listener.

The MCP boundary exposes the latest dashboard snapshot, findings for a known
check, a re-run of a check registered by the latest pipeline, and explicitly
allowlisted manual-check updates. Calls are logged to the `Mewra PreFlight MCP`
output channel. The bridge accepts only bounded JSON-RPC requests and validates
the loopback host plus bearer token before parsing a request.

Mewra Pounce owns its own `pounce:blast-radius` check and registers it as a companion. PreFlight has no Pounce scanner or activation logic; it renders the generic optional `routes` payload returned by any registered check.

The Webview may request an install only by check ID. The extension host resolves
that ID through its fixed built-in allowlist before composing a terminal command;
it never accepts a package name or shell fragment from the Webview. Advisory
links are opened only when they match an HTTPS URL in the current validated
check snapshot.

Security-sensitive companion checks can use `PreFlightContext.resolveTrustedTool()`. It resolves only user-owned or system tool locations and never a binary from the opened workspace. The method is additive to API v1, so a companion can return `not-configured` rather than fall back to an untrusted executable on an older host.

## 6. Ecosystem detection

`detectActiveEcosystems` checks for marker files (`package.json`, `go.mod`, `go.sum`, `uv.lock`, `pyproject.toml`, `requirements.txt`, `Pipfile`, `setup.py`, `composer.json`) across the workspace. It supports multi-ecosystem workspaces simultaneously.

## 7. Tool resolution

Tools (e.g., `prettier`, `eslint`, `tsc`, `ruff`, `black`, `flake8`, `mypy`, `gofmt`, `govet`, `golangci-lint`, `php-cs-fixer`, `phpstan`, `psalm`, custom CLI tools) are resolved using project-local paths first (`node_modules/.bin/`, `.venv/bin/`, `venv/bin/`, `vendor/bin/`), user local environments (`~/.cargo/bin`, `~/.local/bin`, `~/go/bin`, `~/.composer/vendor/bin`), and finally system `PATH`. A check degrades gracefully to `not-configured` if the binary cannot be resolved.

`resolveTrustedTool()` is intentionally stricter: it excludes project-local paths and does not consult `PATH`.
