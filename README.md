<p align="center">
  <img src="./assets/brand/icon.png" width="84" height="84" alt="Mewra PreFlight Logo" />
</p>

# Mewra PreFlight — Pre-Push Sanity Pipeline

<p align="center">
  <a href="https://preflight.mewra.app"><img src="https://img.shields.io/badge/website-preflight.mewra.app-6366f1" alt="Website" /></a>
  <a href="https://github.com/mewra-lab/mewra-preflight"><img src="https://img.shields.io/badge/GitHub-mewra--lab%2Fmewra--preflight-181717?logo=github" alt="GitHub Repository" /></a>
  <a href="https://github.com/mewra-lab/mewra-preflight/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=mewra.mewra-preflight"><img src="https://img.shields.io/badge/VS_Code-Marketplace-007ACC?logo=visualstudiocode" alt="VS Code Marketplace" /></a>
</p>

> **Run diff-scoped checks before every push. One dashboard. One button to open your PR.**

Mewra PreFlight is an open-source VS Code extension that runs a pre-push sanity pipeline scoped to your git diff. It surfaces Prettier, ESLint, and TypeScript issues in a live dashboard, and unlocks a PR launch button only when everything passes.

Website: [preflight.mewra.app](https://preflight.mewra.app) · Part of the [Mewra](https://github.com/mewra-lab) developer tooling ecosystem.  
Source code: [github.com/mewra-lab/mewra-preflight](https://github.com/mewra-lab/mewra-preflight)

---

## Why

Pre-push hooks catch issues too late — they block the push, force you back to the terminal, and break flow. Mewra PreFlight gives you the same signal in VS Code, without a hook, before you're even ready to push.

```text
You hit Alt+Shift+P

PreFlight checks:  ✓ Prettier           (3ms)
                   ✗ TypeScript         (412ms)
                     src/api.ts:88 — Argument is not assignable
                   ✗ No console.log
                     (diff):0 — Stray console.log() detected

PR button → blocked until errors are fixed.
```

---

## Features

- **Diff-scoped** — only checks files you changed vs. `main` (or your configured target branch)
- **Live dashboard** — each check updates in real-time as it runs
- **Graceful degradation** — missing tools show `not-configured`, not errors
- **PR launch button** — one click to open your PR in the browser, blocked until pipeline is clean
- **Built-in check packs** — Universal (no console.log, no debugger, no credential leak) + JS/TS (Prettier, ESLint, TypeScript)
- **Local-first** — no AI, no network calls, no telemetry, zero cloud dependency

---

## Demo

| Action                | Result                                      |
| --------------------- | ------------------------------------------- |
| `Alt+Shift+P`         | Dashboard opens with live check status      |
| Check fails           | Finding list expands with file:line details |
| Click a finding       | Jumps to that file and line in editor       |
| All checks pass       | PR button turns green                       |
| _↗ Open Pull Request_ | Opens PR creation page in browser           |

---

## Install

### From the VS Code Marketplace

Search `Mewra PreFlight` in the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`), or paste:

```bash
ext install mewra.mewra-preflight
```

### From a release VSIX

1. Download `mewra-preflight-x.y.z.vsix` from [GitHub Releases](https://github.com/mewra-lab/mewra-preflight/releases)
2. In VS Code: Extensions panel → `···` → `Install from VSIX…`

---

## Commands

| Command                         | Title               | Default keybinding |
| ------------------------------- | ------------------- | ------------------ |
| `mewra-preflight.runPipeline`   | Run Pipeline        | `Alt+Shift+P`      |
| `mewra-preflight.openDashboard` | Open Dashboard      | —                  |
| `mewra-preflight.launchPR`      | Launch Pull Request | Dashboard button   |

---

## Settings

| Setting                             | Default                 | Description                                    |
| ----------------------------------- | ----------------------- | ---------------------------------------------- |
| `mewraPreflight.targetBranch`       | `"main"`                | Branch to diff against                         |
| `mewraPreflight.enabledPacks`       | `["universal","js-ts"]` | Active check packs                             |
| `mewraPreflight.blockingOnWarnings` | `false`                 | Warnings block PR button                       |
| `mewraPreflight.gitHost`            | `"github"`              | Git platform for PR URL (`github` or `gitlab`) |

---

## Check Packs

### Universal (always active)

| Check              | What it detects                     |
| ------------------ | ----------------------------------- |
| No console.log     | Stray `console.*()` calls in diff   |
| No debugger        | Stray `debugger` statements in diff |
| No credential leak | Hardcoded secrets in added lines    |

### JS/TS

| Check      | Tool                   | Behavior when tool missing |
| ---------- | ---------------------- | -------------------------- |
| Prettier   | `prettier --check`     | `not-configured`           |
| ESLint     | `eslint --format json` | `not-configured`           |
| TypeScript | `tsc --noEmit`         | `not-configured`           |

---

## Development

```bash
git clone https://github.com/mewra-lab/mewra-preflight.git
cd mewra-preflight
pnpm install
pnpm build
```

Press `F5` to launch the Extension Development Host. Full quality gate:

```bash
pnpm validate
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for contribution guidelines.

---

## License

MIT — see [`LICENSE`](./LICENSE).

Part of the [Mewra](https://github.com/mewra-lab) open-source developer tooling ecosystem.
