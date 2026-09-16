# Contributing to Mewra PreFlight

Thank you for contributing. Mewra PreFlight is a local-first, security-conscious VS Code extension. Contributions are welcome, but changes to Webview code, `child_process` usage, and check packs receive additional review.

---

## 1. Before contributing

Read these first:

- [`SPEC.md`](./SPEC.md) — product specification
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — module structure and trust boundaries
- [`docs/TESTING.md`](./docs/TESTING.md) — testing strategy
- [`docs/UX.md`](./docs/UX.md) — UX specification
- [`docs/GIT-WORKFLOW.md`](./docs/GIT-WORKFLOW.md) — Git branching, Conventional Commits, and PR workflow
- [`SECURITY.md`](./SECURITY.md) — security requirements

---

## 2. Local setup

```bash
git clone https://github.com/mewra-lab/mewra-preflight.git
cd mewra-preflight
pnpm install
pnpm build
```

Press `F5` in VS Code to launch the Extension Development Host for manual testing.

To test a contributed check from the sibling `mewra-dependency-guard` repository,
select **Run PreFlight + Dependency Guard (Extension Development Host)** in the
Run and Debug view. It builds and loads both source extensions, avoiding a mix
of the development PreFlight extension and an installed Dependency Guard VSIX.

Full quality gate:

```bash
pnpm validate
```

Expected pipeline: format check → TypeScript check → unit tests → build.

---

## 3. Coding rules

- Strict TypeScript — no `any` unless narrowly justified.
- No code comments unless they are `// MARK:` section markers.
- Validate all Webview messages at runtime with Zod (`src/shared/messages.ts`).
- Never use `eval` or `new Function`.
- Never build shell commands from user or workspace input — always use `execFile` with fixed argument arrays.

---

## 4. Adding a check pack

1. Create `src/core/checks/packs/<ecosystem>/` directory.
2. Implement each check as a `CheckRunner` object (see `src/core/checks/check-contract.ts`).
3. Export a `build<Ecosystem>Pack(): CheckRunner[]` factory in `index.ts`.
4. Register the pack in `src/extension/preflight-panel.ts` under `_runPipeline`.
5. Add the pack ID to the `mewraPreflight.enabledPacks` enum in `package.json`.
6. Add unit tests in `tests/unit/packs/<ecosystem>.test.ts`.
7. Update `SPEC.md` and `docs/ARCHITECTURE.md` if the pack pattern changes.

---

## 5. Security-sensitive changes

These require explicit reviewer attention:

- Webview CSP (any relaxation is a blocker);
- `localResourceRoots` expansion;
- new `child_process` calls (must use fixed argument arrays);
- Zod schema changes in `src/shared/messages.ts`;
- new `executeCommand` calls driven by Webview input.

---

## 6. Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(pack): add Python ruff check pack
fix(runner): handle check timeout gracefully
security: restrict child_process args to fixed arrays
chore: upgrade preact to 10.x
```

---

## 7. Tests

Run before opening a PR:

```bash
pnpm validate
```

Unit tests live in `tests/unit/`.

---

## 8. Reporting vulnerabilities

Do not publish exploitable vulnerabilities in a public issue. Use GitHub's private vulnerability reporting channel. See [SECURITY.md](./SECURITY.md).
