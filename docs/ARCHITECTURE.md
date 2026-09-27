# Mewra PreFlight — Architecture

## 1. Architectural goals

Git subprocess output is bounded to 32 MiB per stdout/stderr stream. A buffer
overflow aborts diff computation with an actionable error; partial patches must
never reach checks. Branch comparison fallbacks must propagate this resource
limit rather than silently switch the comparison scope.

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

Workspace configuration is validated at runtime before checks are built. Missing
files use defaults; malformed or unsupported fields stop the pipeline. Ecosystem
check settings enforce enabled flags, allowlisted tool choices, test-pairing
patterns, and CLI timeouts. Explicit tool choices do not silently fall back.

The runner validates dependency IDs and cycles before executing checks. Independent
checks run concurrently; dependent checks wait for successful prerequisites. MCP
re-runs execute and update only the requested check and its prerequisite closure.

Check-command output is bounded to 32 MiB per stream, just like Git output.
Oversized output is discarded and fails the check rather than reaching a parser.
TypeScript execution errors without valid diagnostics fail closed; actual diagnostics
outside the selected changed files remain filtered.

Git name/status and untracked metadata use NUL-delimited records. Rename destinations
are the current paths. Untracked text files above 1 MiB are included, subject to
the same 32 MiB aggregate patch limit; unreadable files abort the pipeline instead
of silently disappearing. Working scope never falls back to the previous commit.

JS/TS test pairing looks for colocated or mirrored `tests/` and `tests/unit/`
paths, including monorepo package roots and `.test`/`.spec` JS/TS/JSX/TSX files.
A same-named test in another module or a deleted test does not satisfy pairing.

Each check pack exposes a `build<Pack>Pack(): CheckRunner[]` factory (or `buildCustomChecks` for community JSON-based packs). A `CheckRunner` must:

- declare `id`, `label`, `severity`, `pack`;
- optionally declare a host-resolved `actionCommand` and `actionLabel` for a skipped-check action;
- implement `appliesTo(diff): boolean` to decide if it should run against the diff;
- implement `run(diff, context): Promise<CheckResult>`;
- return `not-configured` (not `fail`) when the underlying tool is absent;
- use fixed argument arrays in all `child_process` calls.

Before a check runs, `.preflightignore` rules filter its `GitDiff` input. Global rules remove paths for every consumer, while targeted rules remove paths only for the named check or pack.

Installed companion extensions receive the versioned `MewraPreFlightAPI` through `vscode.extensions.getExtension(...).activate()`. The host applies `.mewra-preflight.json` `contributedChecks` enablement and severity controls before dashboard or MCP execution. Check IDs are deduplicated at execution time as a final defensive boundary, so an accidental duplicate contribution cannot run twice or render duplicate dashboard rows.

## 6. MCP bridge

PreFlight registers a native VS Code MCP server definition provider. Its local
HTTP bridge runs only on `127.0.0.1` with an ephemeral port and a random bearer
token supplied through the VS Code server definition or an explicitly confirmed
clipboard export for a local MCP client. Export requires a trusted workspace and
does not persist credentials or edit client configuration. It never exposes a
workspace path, shell, arbitrary command, or public network listener.

The MCP boundary exposes the latest dashboard snapshot, findings for a known
check, a re-run of a check registered by the latest pipeline, and explicitly
allowlisted manual-check updates. Calls are logged to the `Mewra PreFlight MCP`
output channel. The bridge accepts only bounded JSON-RPC requests and validates
the loopback host plus bearer token before parsing a request.

Every request rechecks the selected dashboard repository's MCP configuration.
Disabled MCP rejects existing connections; an explicit empty tool allowlist
exposes no tools. Arrays and null tool results use text content rather than
invalid non-object structured content. See `docs/MCP.md` for client setup.

MCP re-runs verify that the current diff, resolved configuration, and ignore
rules still match the pipeline snapshot; changed inputs require a full dashboard
refresh. Results from obsolete repositories or pipeline runs are discarded.
Manual authority is intersected with the current agent-checkable items on each
request, so revocation does not wait for a dashboard refresh.

Mewra Pounce owns its own `pounce:blast-radius` check and registers it as a companion. PreFlight has no Pounce scanner or activation logic; it renders the generic optional `routes` payload returned by any registered check.

The Webview may request an install only by check ID. The extension host resolves
that ID through its fixed built-in allowlist before composing a terminal command;
it never accepts a package name or shell fragment from the Webview. Advisory
links are opened only when they match an HTTPS URL in the current validated
check snapshot.

The Webview may request a contributed check action only by check ID. The
extension host looks up the action command in the latest validated snapshot,
verifies its command-ID shape, and executes it through the VS Code command
registry. The Webview cannot provide an arbitrary command or shell fragment.

Security-sensitive companion checks can use `PreFlightContext.resolveTrustedTool()`. It resolves only user-owned or system tool locations and never a binary from the opened workspace. The method is additive to API v1, so a companion can return `not-configured` rather than fall back to an untrusted executable on an older host.

## 6. Ecosystem detection

`detectActiveEcosystems` checks for marker files (`package.json`, `go.mod`, `go.sum`, `uv.lock`, `pyproject.toml`, `requirements.txt`, `Pipfile`, `setup.py`, `composer.json`) across the workspace. It supports multi-ecosystem workspaces simultaneously.

## 7. Tool resolution

Tools (e.g., `prettier`, `eslint`, `tsc`, `ruff`, `black`, `flake8`, `mypy`, `gofmt`, `govet`, `golangci-lint`, `php-cs-fixer`, `phpstan`, `psalm`, custom CLI tools) are resolved using project-local paths first (`node_modules/.bin/`, `.venv/bin/`, `venv/bin/`, `vendor/bin/`), user local environments (`~/.cargo/bin`, `~/.local/bin`, `~/go/bin`, `~/.composer/vendor/bin`), and finally system `PATH`. A check degrades gracefully to `not-configured` if the binary cannot be resolved.

`resolveTrustedTool()` is intentionally stricter: it excludes project-local paths and does not consult `PATH`.
