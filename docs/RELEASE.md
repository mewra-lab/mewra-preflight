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
0.3.0  — first-party local packs: Dependency Guard (insecure dependency sources), ORM Cost Sentry (query-in-loop and destructive migrations), Style Guardian (static Tailwind conflicts)
0.4.0  — contributed-check contract v1 and Mewra Dependency Guard companion extension
0.5.0  — create GitHub pull requests and GitLab merge requests through authenticated CLIs, with browser fallback
0.6.0  — Mewra Pounce becomes a companion extension; PreFlight hosts generic contributed route summaries
0.7.0  — native VS Code MCP bridge for safe pipeline status, findings, known-check re-runs, and explicitly allowlisted manual checks
0.7.1  — release workflow shell-conditional fix
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

## 6. GitHub Release workflow

`.github/workflows/release.yml` creates or updates a GitHub Release when a
`vMAJOR.MINOR.PATCH` tag is pushed. It checks out the tag, verifies that it
matches `package.json`, runs the full quality gate, builds the VSIX, and uploads
both the VSIX and `SHA256SUMS.txt`.

For an existing tag created before this workflow was merged, run **Release**
from the Actions tab with the tag as the `tag` input. For a new release, merge
the release PR, update `package.json`, and push its matching tag.

The workflow publishes GitHub Releases only. Visual Studio Marketplace and
Open VSX publishing remain explicit release actions until their credentials and
publication policy are configured.

## 7. Release notes

GitHub generates notes from merged pull requests. Add a concise product summary
when a release needs context: headline, user-visible changes, configuration
notes, and validation status. Do not claim route tracing when the Pounce pack
only detects route declarations in changed files.

## 8. Changelog

### v0.7.3

**Companion identity documentation**

- Updates Dependency Guard's Marketplace ID to
  `mewra.mewra-dependency-guard-companion`; its PreFlight check IDs and
  `.mewra-preflight.json` configuration remain unchanged.

### v0.7.2

**Reliable companion and style checks**

- Deduplicates check IDs immediately before execution, preventing an accidental
  duplicate companion contribution from running twice or rendering two rows.
- Treats Tailwind modifier scopes independently, so base, `hover:`, `focus:`,
  and responsive utilities are no longer reported as conflicts with each other.
- Documents the then-current Dependency Guard Marketplace ID; its existing
  PreFlight check IDs and `.mewra-preflight.json` configuration remain
  unchanged.
- Excludes a repository-local `.mewra-preflight.json` from the distributable
  VSIX; the schema and tracked example remain available to users.

### v0.7.1

**Release workflow fix**

- Removed an extra shell terminator that incorrectly marked an otherwise
  published release workflow as failed.

### v0.7.0

**Native VS Code MCP bridge**

- **Safe discovery**: VS Code discovers a native MCP server from the extension;
  it binds only to loopback, validates the host and a random bearer token, and
  never exposes an arbitrary command surface.
- **Agent workflow**: configured agents can read the dashboard snapshot and
  findings, then re-run only checks registered by the latest pipeline.
- **Explicit manual authority**: agents can update a manual item only when both
  the item and the workspace MCP allowlist opt in.
- **Auditability**: MCP calls are recorded in the `Mewra PreFlight MCP` output
  channel.

### v0.6.0

**Pounce companion boundary**

- **Single ownership**: moved `pounce:blast-radius` route declaration detection from PreFlight into Mewra Pounce, which registers the check through the versioned extension API.
- **Tool-agnostic host**: PreFlight no longer imports, enables, or configures a Pounce pack. It renders generic contributed route payloads and Mermaid PR/MR sections.
- **Workspace configuration**: control Pounce through `contributedChecks.pounce:blast-radius`; the legacy `ecosystems.pounce` and `enabledPacks` entries are removed.
- **Development host**: the combined F5 profile now loads PreFlight, Dependency Guard, and Pounce together.

### v0.5.0

**Direct GitHub PR creation**

- **Separated push and creation**: the dashboard never pushes; users keep their normal Source Control workflow and run Create PR / MR after their branch is available remotely.
- **GitHub and GitLab CLI integration**: trusted, authenticated `gh` and `glab` installations create the generated PR/MR descriptions directly. Existing GitHub PRs are opened instead of duplicated.
- **Transparent fallback**: if a provider CLI is unavailable or cannot create the PR/MR, PreFlight opens the provider page and copies the generated description for paste.
- **Privacy and safety**: provider communication occurs only after the explicit button click, through the user's existing CLI authentication. CLI commands use fixed argument arrays and trusted executable resolution.
- **Safe dependency-scanner setup**: contributed checks can opt out of the generic package-manager installer. Dependency Guard's OSV/Trivy scanner no longer attempts to install a nonexistent `security-scan` npm package.
- **Actionable dependency findings**: Security Scan groups vulnerabilities by package and displays scanner-provided severity, CVSS, fixed-version, and advisory details when available.
- **Webview hardening**: tool-install requests resolve through a fixed host-side allowlist, and advisory links must belong to the current validated result snapshot.

### v0.4.0

**Contributed Dependency Guard**

- **Versioned host contract**: `MewraPreFlightAPI` now exposes `apiVersion: 1` for companion-extension compatibility checks.
- **Configuration enforcement**: registered checks honor `.mewra-preflight.json` `contributedChecks.<id>.enabled` and `.severity` settings in the dashboard and MCP handler.
- **Dependency Guard separation**: OSV and Trivy scanning, plus `dependency-guard:unsafe-source`, moved out of the host into `mewra.mewra-dependency-guard`, keeping PreFlight tool-agnostic.

### v0.3.0

**First-party local safety packs**

- **Dependency Guard** (`dependency-guard:unsafe-source`) fails newly added insecure `http://` and `git+http://` package sources in supported manifests and lock files.
- **ORM Cost Sentry** flags potential database queries introduced inside loops and destructive `DROP TABLE`, `DROP COLUMN`, `DROP DATABASE`, or `DROP SCHEMA` migration statements.
- **Style Guardian** flags conflicting static Tailwind utilities in changed JSX, Vue, HTML, Astro, and Svelte templates.
- **Configuration**: all three packs are enabled by default and may be disabled per workspace under `ecosystems` in `.mewra-preflight.json`.
- **Scope**: rules are local diff heuristics. This release does not claim CVE scanning, AST analysis, or local historical trend storage.

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
