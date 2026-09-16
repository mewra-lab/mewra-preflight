# Mewra PreFlight — Testing Strategy

## 1. Quality goals

Testing must protect:

- diff computation correctness (git output parsing);
- check runner execution lifecycle (pending → running → pass/fail/skipped);
- graceful degradation when tools are missing (`not-configured`);
- universal pack pattern detection (no-console-log, no-debugger, no-env-leak), including source-only matching for debugger statements;
- Webview protocol safety (Zod message validation);
- contributed security-finding metadata and advisory-link handling;
- PR URL construction from remote URLs and branches, plus GitHub and GitLab CLI PR/MR creation/fallback behavior.

## 2. Test layers

### Unit tests (Vitest)

Pure modules testable without VS Code:

- `git-diff.ts` — name-status parsing logic;
- `runner.ts` — execution lifecycle, parallel scheduling, error recovery;
- `detect-ecosystem.ts` — file presence detection;
- `pr-launcher.ts` — remote URL → HTTPS conversion, PR URL construction, and fixed-argument GitHub/GitLab CLI PR/MR creation;
- `packs/universal/` — pattern matching in diff patches;
- `packs/js-ts/` — pack factory shape and check properties;
- Pounce companion integration — route payload rendering and generic Mermaid PR/MR sections;
- `packs/first-party-packs.test.ts` — ORM cost and Tailwind conflict heuristics;
- `check-registry.test.ts` — contributed-check registration and workspace enablement/severity overrides;
- `context.test.ts` — trusted security-tool resolution excludes workspace executables;
- `preflight-ignore.ts` — global and check/pack-specific diff filtering;
- `messages.ts` — Zod schema validation for both directions.
- `mcp-handler.test.ts` — snapshot, known-check execution, resource access, and
  manual-check authorization boundaries used by the MCP bridge.

### Extension tests (@vscode/test-electron)

- activation and command registration;
- `PreFlightPanel` creation and disposal;
- keybinding registration.

### Manual verification

Live tool invocation and Webview rendering cannot be fully automated.

Manual checklist:

- [ ] `Alt+Shift+P` → pipeline starts and dashboard opens
- [ ] Dashboard shows `running` spinner while checks execute
- [ ] All checks reflect correct pass/fail/not-configured after run
- [ ] Click a finding → opens file at correct line
- [ ] Security findings group by package and show advisory metadata without
      treating a lockfile finding as a navigable line number
- [ ] "Create PR / MR" leaves push to Source Control, then creates via `gh`/`glab` or opens the documented browser fallback with the description copied
- [ ] Button is blocked (greyed out) when any error check fails
- [ ] Tool missing (e.g., no Prettier) shows `not-configured`, not `fail`
- [ ] Enable **Mewra PreFlight** in the MCP tools picker; only configured tools
      are discoverable and `get_preflight_status` returns the latest dashboard run

## 3. Running tests

```bash
pnpm test
```

## 4. Full quality gate

```bash
pnpm validate
```

Expected: format check → TypeScript check → unit tests → build.
