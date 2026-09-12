# AGENTS.md — Mewra PreFlight

This file defines project-level rules for coding agents.

## Required reading

Before non-trivial changes, read:

1. `SPEC.md`
2. `docs/ARCHITECTURE.md`
3. `docs/TESTING.md`
4. `docs/UX.md`
5. `docs/GIT-WORKFLOW.md`

For packaging/release changes, also read `docs/RELEASE.md`.

## Product scope

Mewra PreFlight is an open-source VS Code extension that runs a diff-scoped pre-push sanity pipeline and renders a live dashboard. It resolves tools from project-local `node_modules` / `vendor` / `venv` before falling back to global `PATH`. Missing tools surface as `not-configured` — never as `failed`.

Do **not** implement cloud sync, AI suggestions, cross-repo checks, or real-time file watching — these are v2/v3 roadmap items.

## Current stack

```text
TypeScript
VS Code Extension API
Preact
Zod
esbuild
pnpm 12.3.4
Vitest
Prettier
Husky + lint-staged
```

## Architecture rules

- `CheckRunner` is the **only** public interface checks implement. No check may couple itself to VS Code APIs.
- Each check pack lives in its own folder under `src/core/checks/packs/`.
- Keep Node/VS Code APIs out of `src/webview/` modules.
- Webview modules must not import from `src/extension/` or `src/core/`.
- `src/shared/` is the only layer both sides may import.
- All `child_process` calls must use fixed argument arrays — never user-derived strings spliced into shell commands.

## Security invariants

Never introduce:

- `eval` or `new Function`;
- broad CSP wildcards or `unsafe-inline` scripts;
- arbitrary `executeCommand` driven by Webview input;
- unvalidated Webview messages (use Zod schemas in `src/shared/messages.ts`);
- shell commands built from user/workspace input;
- unsafe `innerHTML` for untrusted content.

If a requested feature appears to require one of these, stop and propose a safer design.

## Webview rules

Treat Webview input as untrusted.

- Validate both message directions at runtime with Zod.
- Keep `localResourceRoots` restricted to `dist/`.
- Nonce-only script CSP (no `unsafe-inline` scripts).
- Prefer VS Code theme variables for all colors.

Brand source:

```text
assets/brand/mewra-logo.svg
```

Runtime Webview assets are copied to `dist/webview/assets/` during build.

## No-comment rule

Do **not** add code comments unless they are `// MARK:` section markers.
Let types and naming be self-documenting.

## Quality gate

Before a task is complete:

```bash
pnpm validate
```

Expected pipeline: format check → TypeScript check → tests → build.

## Documentation discipline

Update the relevant Markdown file in `docs/` in the same change when modifying:

- requirements;
- architecture;
- security boundaries;
- check pack behavior;
- UX behavior;
- release behavior.

Do not silently diverge from documented architecture.
