# Mewra PreFlight — Architecture

## 1. Architectural goals

Mewra PreFlight must remain:

- deterministic and local-first (no AI, no network calls in v1);
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
│   │   │       ├── pounce/        — changed-route detection and Mermaid summaries
│   │   │       └── custom/        — Community JSON-based custom pack runner
│   │   ├── ecosystem/
│   │   │   └── detect-ecosystem.ts
│   │   └── pr/
│   │       └── pr-launcher.ts     — PR URL builder
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
│   │   │   └── packs/{universal,js-ts,go,python,php,custom}/
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

## 6. Ecosystem detection

`detectActiveEcosystems` checks for marker files (`package.json`, `go.mod`, `go.sum`, `uv.lock`, `pyproject.toml`, `requirements.txt`, `Pipfile`, `setup.py`, `composer.json`) across the workspace. It supports multi-ecosystem workspaces simultaneously.

## 7. Tool resolution

Tools (e.g., `prettier`, `eslint`, `tsc`, `ruff`, `black`, `flake8`, `mypy`, `gofmt`, `govet`, `golangci-lint`, `php-cs-fixer`, `phpstan`, `psalm`, custom CLI tools) are resolved using project-local paths first (`node_modules/.bin/`, `.venv/bin/`, `venv/bin/`, `vendor/bin/`), user local environments (`~/.cargo/bin`, `~/.local/bin`, `~/go/bin`, `~/.composer/vendor/bin`), and finally system `PATH`. A check degrades gracefully to `not-configured` if the binary cannot be resolved.
