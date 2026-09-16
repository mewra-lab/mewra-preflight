# Mewra PreFlight — UX Specification

## 1. Dashboard panel

- Opens as a `WebviewPanel` in `ViewColumn.Beside` (alongside the editor).
- Library: **Preact** (lightweight, no Cytoscape — PreFlight is a list UI, not a graph).
- All colors use VS Code theme CSS variables — no hardcoded hex colors in structure.

## 2. Panel states

| State       | What is shown                                           |
| ----------- | ------------------------------------------------------- |
| **Idle**    | Tagline + "▶ Run Pipeline" button                       |
| **Running** | Check rows with live status updates + spinner in header |
| **Done**    | All rows resolved + "↗ Create PR / MR" button in footer |
| **Error**   | Warning icon + error message + "▶ Re-run" button        |

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
- Completed contributed checks with `resultCommand` show a keyboard-accessible **Open results** button for pass, warning, fail, skipped, and not-configured states. It opens the companion's own result experience and does not change the check outcome. Pending/running rows do not offer that action.
- Route-summary checks may show colour-coded HTTP method/path chips. Each chip opens its source file and line when available.
- Dependency-security findings group by package/version. They show severity,
  CVSS, fixed version, and an advisory link when the scanner provides those
  fields; lockfile findings do not expose a misleading `:0` source location.

## 4. Manual checklist & PR launch button

```
MANUAL CHECKS
[ ] Applied DB migration to dev cluster
    (Triggered: prisma/migrations/** was modified)

[ 🚀 Create PR / MR (2 blockers remaining) ]
```

- Triggered manual checks display condition trigger note and toggleable checkbox.
- **Ready** (green): all error-severity checks pass and error manual checks are checked.
- **Blocked** (muted): one or more error checks or manual checklist items remain unresolved, with live blocker count badge.
- If `blockingOnWarnings` is `true`, warning-severity failures also block.
- Clicking a ready button never pushes the current branch; users keep their normal Source Control workflow for that action. For GitHub, PreFlight uses an authenticated `gh` CLI to create a PR directly (or opens an existing PR). For GitLab, it uses an authenticated `glab` CLI to create an MR with the generated description. If either CLI is unavailable, PreFlight opens the provider page and copies the description for paste.

## 5. Commands and keybindings

| Command ID                      | Title          | Keybinding          |
| ------------------------------- | -------------- | ------------------- |
| `mewra-preflight.runPipeline`   | Run Pipeline   | `Alt+Shift+P`       |
| `mewra-preflight.openDashboard` | Open Dashboard | —                   |
| `mewra-preflight.launchPR`      | Create PR / MR | Webview button only |

## 6. Settings

| Key                                 | Default                                                                        | Description                 |
| ----------------------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| `mewraPreflight.targetBranch`       | `"main"`                                                                       | Branch to diff against      |
| `mewraPreflight.enabledPacks`       | `["universal","js-ts","go","python","php","orm-cost-sentry","style-guardian"]` | Active built-in check packs |
| `mewraPreflight.blockingOnWarnings` | `false`                                                                        | Warnings block PR button    |
| `mewraPreflight.gitHost`            | `"github"`                                                                     | Platform for PR URL         |

## 7. MCP agent access

Mewra PreFlight appears in VS Code's MCP server management when a workspace is
open. By default, agents can read the latest pipeline status and check findings,
and re-run a registered check after the dashboard has run at least once.

Workspace owners can restrict or disable MCP in `.mewra-preflight.json`:

```json
{
  "mcp": {
    "enabled": true,
    "exposedTools": ["get_preflight_status", "get_check_findings", "run_check"],
    "agentCheckableManualChecks": ["manual-migration"]
  }
}
```

Manual items remain human-only unless their ID is also explicitly allowlisted.
The checklist item itself must also set `"agentCheckable": true`.

## 8. Design principles

- VS Code theme variables exclusively — no hardcoded colors in structure.
- Must remain usable in narrow sidebar-width panels.
- Keyboard-navigable (buttons reachable by Tab, findings by Enter).
- No external fonts or remote resources loaded by the Webview.
- Live updates via `postMessage` — no polling.
- A Webview action identifies a check or finding only; the extension host owns
  all terminal commands and validates advisory links against the active snapshot.
