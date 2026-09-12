# Mewra PreFlight — Git, Branch & Pull Request Workflow

## Purpose

This document defines the standard Git, branch, and Pull Request (PR) workflow for **Mewra PreFlight**.

Mewra PreFlight is an open-source VS Code extension with a local-first, zero-telemetry, and security-conscious design.

The core development loop is:

```text
main
  ↓
feature / milestone branch
  ↓
focused, logical commits
  ↓
push
  ↓
Pull Request (PR)
  ↓
CI checks & review
  ↓
Squash and Merge
  ↓
main
```

---

# 1. Main Branch Policy

`main` is the primary stable branch.

Invariants for `main`:

- Always buildable: `pnpm build` must never fail on `main`.
- Always validated: `pnpm validate` passes 100% green.
- Clean history: feature branches merge into `main` via **Squash and Merge**.
- No direct milestone development.
- Protected: force pushes and deletions are prohibited.

---

# 2. Branch Naming Conventions

| Prefix      | Purpose                   | Example                          |
| ----------- | ------------------------- | -------------------------------- |
| `feat/`     | New user-facing feature   | `feat/js-ts-prettier-check`      |
| `pack/`     | New ecosystem check pack  | `pack/python-ruff`               |
| `check/`    | New built-in check        | `check/no-todo-comments`         |
| `fix/`      | Bug fix                   | `fix/tsc-output-parser`          |
| `refactor/` | Structural refactor       | `refactor/extract-runner`        |
| `test/`     | Adding or improving tests | `test/runner-edge-cases`         |
| `docs/`     | Documentation changes     | `docs/architecture-update`       |
| `chore/`    | Tooling, dependencies     | `chore/upgrade-preact`           |
| `ci/`       | CI/CD workflows           | `ci/add-open-vsx-publish`        |
| `perf/`     | Performance optimizations | `perf/parallel-check-scheduling` |

---

# 3. Commit Guidelines

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <description in imperative present tense>
```

### Supported Types

- `feat:` new feature or capability
- `pack:` new ecosystem check pack
- `check:` new built-in check
- `fix:` bug fix
- `refactor:` code restructuring without changing behavior
- `test:` adding or updating tests
- `docs:` documentation additions or edits
- `chore:` maintenance, dependency upgrades, tooling
- `perf:` performance improvement
- `ci:` CI workflow configuration
- `build:` packaging, esbuild, or asset build scripts
- `security:` security fix or hardening

### Scopes

- `core`: `src/core/` (runner, diff, pr)
- `pack`: `src/core/checks/packs/` (check packs)
- `webview`: `src/webview/` (Preact UI)
- `extension`: `src/extension/` (VS Code commands, panel)
- `shared`: `src/shared/` (messages, types, Zod schemas)
- `docs`: documentation files
- `ci`: CI workflows

---

# 4. Pre-Commit Hook

Mewra PreFlight uses **Husky** + **lint-staged** + **Prettier**:

```text
git commit
   ↓
.husky/pre-commit
   ↓
lint-staged
   ↓
Prettier formats staged files
   ↓
commit created
```

---

# 5. Quality Gate Before Opening a PR

```bash
pnpm validate
```

This runs the complete validation pipeline:

```text
1. pnpm format:check  (Prettier)
2. pnpm check         (tsc --noEmit)
3. pnpm test          (Vitest unit tests)
4. pnpm build         (esbuild extension + webview)
```

---

# 6. Merge Strategy: Squash and Merge

All Pull Requests are merged using **Squash and Merge**.

### Squash Commit Message Format

```text
feat(pack): add Python ruff check pack (#12)
```
