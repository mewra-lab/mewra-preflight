## Summary

<!-- Provide a concise description of the purpose of this PR and what problem it solves. -->

## Changes

<!-- List the key changes introduced in this PR. -->

-

## Type of Change

- [ ] `feat`: New feature or capability
- [ ] `pack`: New ecosystem check pack
- [ ] `check`: New built-in check
- [ ] `fix`: Bug fix
- [ ] `refactor`: Structural refactoring with no behavior change
- [ ] `test`: New or improved tests
- [ ] `docs`: Documentation updates
- [ ] `chore`: Maintenance, dependencies, or tooling
- [ ] `security`: Security-related fix or hardening

## Architecture & Code Standards

- [ ] **CheckContract**: Every check implements `CheckDefinition` exactly — no shortcuts
- [ ] **Layer isolation**: `src/webview/` does not import from `src/extension/` or `src/core/`
- [ ] **Shared bridge**: Only `src/shared/` is shared across the extension/webview boundary
- [ ] **Zod validation**: All Webview message payloads validated via Zod schemas
- [ ] **No-comment rule**: No code comments except `// MARK:` section markers
- [ ] **No eval**: Never uses `eval`, `new Function`, or unvalidated shell execution
- [ ] **No free-form shell**: Any `child_process` call uses a fixed command array, never a user-derived string

## Security & Privacy

- [ ] Local-first: 100% on-device, zero remote network calls or telemetry
- [ ] CSP compliant: Strict nonce-only script CSP (no `unsafe-inline`)
- [ ] Restricted access: `localResourceRoots` strictly confined to `dist/`
- [ ] `child_process` calls use fixed argument arrays — no workspace input spliced into commands

## Testing & Verification

- [ ] `pnpm validate` passes cleanly (`format:check` + `typecheck` + `test` + `build`)
- [ ] Unit tests added/updated under `tests/unit/`
- [ ] Edge cases (tool missing, diff empty, timeout, parse error) covered
- [ ] Tested manually via Extension Development Host (`F5`)

## Documentation Synchronization

- [ ] Documentation updated in the same PR if behavior/architecture changed:
  - `SPEC.md`
  - `docs/ARCHITECTURE.md`
  - `docs/UX.md`
  - `docs/TESTING.md`
  - `SECURITY.md`
  - `README.md`

## Screenshots / Screen Recordings (if UI affected)

<!-- Attach before/after screenshots or recording of the PreFlight dashboard -->
