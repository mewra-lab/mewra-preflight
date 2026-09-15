# Mewra PreFlight — UX Specification

## 1. Dashboard panel

- Opens as a `WebviewPanel` in `ViewColumn.Beside` (alongside the editor).
- Library: **Preact** (lightweight, no Cytoscape — PreFlight is a list UI, not a graph).
- All colors use VS Code theme CSS variables — no hardcoded hex colors in structure.

## 2. Panel states

| State       | What is shown                                              |
| ----------- | ---------------------------------------------------------- |
| **Idle**    | Tagline + "▶ Run Pipeline" button                          |
| **Running** | Check rows with live status updates + spinner in header    |
| **Done**    | All rows resolved + "↗ Open Pull Request" button in footer |
| **Error**   | Warning icon + error message + "▶ Re-run" button           |

## 3. Check row anatomy

```
[icon] Label                               [Install] [Fix All] duration
       ├ finding: src/foo.ts:42 — message        [Fix]
       └ +N more findings
```

- Status icon: ✓ pass, ✗ fail, ⚠ warning, — not-configured, ⊘ skipped, ⟳ running, ○ pending.
- Click a finding to jump to that file and line.
- When status is `not-configured`, an `[ Install ]` button is shown to install the tool into project devDependencies via integrated terminal.
- QuickFix buttons (`[Fix All]` and `[Fix]`) trigger linter/formatter auto-fix with spinner feedback.
- Route-summary checks may show colour-coded HTTP method/path chips. Each chip opens its source file and line when available.

## 4. Manual checklist & PR launch button

```
MANUAL CHECKS
[ ] Applied DB migration to dev cluster
    (Triggered: prisma/migrations/** was modified)

[ 🚀 Push & Create PR (2 blockers remaining) ]
```

- Triggered manual checks display condition trigger note and toggleable checkbox.
- **Ready** (green): all error-severity checks pass and error manual checks are checked.
- **Blocked** (muted): one or more error checks or manual checklist items remain unresolved, with live blocker count badge.
- If `blockingOnWarnings` is `true`, warning-severity failures also block.

## 5. Commands and keybindings

| Command ID                      | Title               | Keybinding          |
| ------------------------------- | ------------------- | ------------------- |
| `mewra-preflight.runPipeline`   | Run Pipeline        | `Alt+Shift+P`       |
| `mewra-preflight.openDashboard` | Open Dashboard      | —                   |
| `mewra-preflight.launchPR`      | Launch Pull Request | Webview button only |

## 6. Settings

| Key                                 | Default                 | Description              |
| ----------------------------------- | ----------------------- | ------------------------ |
| `mewraPreflight.targetBranch`       | `"main"`                | Branch to diff against   |
| `mewraPreflight.enabledPacks`       | `["universal","js-ts"]` | Active check packs       |
| `mewraPreflight.blockingOnWarnings` | `false`                 | Warnings block PR button |
| `mewraPreflight.gitHost`            | `"github"`              | Platform for PR URL      |

## 7. Design principles

- VS Code theme variables exclusively — no hardcoded colors in structure.
- Must remain usable in narrow sidebar-width panels.
- Keyboard-navigable (buttons reachable by Tab, findings by Enter).
- No external fonts or remote resources loaded by the Webview.
- Live updates via `postMessage` — no polling.
