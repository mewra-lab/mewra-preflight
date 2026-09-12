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
[icon] Label                                    duration
       ├ finding: src/foo.ts:42 — message
       └ +N more findings
```

- Status icon: ✓ pass, ✗ fail, ⚠ warning, — not-configured, ⊘ skipped, ⟳ running, ○ pending.
- Click a finding to jump to that file and line.
- Max 8 findings shown per check; overflow shows "+N more findings".

## 4. PR launch button

```
[ ↗ Open Pull Request ]
```

- **Ready** (green): all error-severity checks pass.
- **Blocked** (muted): one or more error checks fail.
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
