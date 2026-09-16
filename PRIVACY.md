# Mewra PreFlight — Privacy

Mewra PreFlight is a local-first VS Code extension. It runs `git diff` and local code quality tools inside your workspace, renders results in a Webview panel, and operates entirely on your machine.

---

## Default privacy promise

Mewra PreFlight:

- does **not** require an account;
- does **not** send telemetry, analytics, or usage data to Mewra or any third party;
- does **not** upload your source code, file paths, or diff content to any server;
- does **not** make background network requests of any kind;
- does **not** read `.env` files, credentials, or secrets (the `no-env-leak` check scans only diff line content locally);
- stores **no** persistent user data between sessions.

---

## What data is processed locally

When you run the pipeline, the extension:

1. executes `git diff <target>...HEAD` to obtain changed files and a raw patch;
2. passes the patch to check runners that scan for patterns locally;
3. invokes local tools (`prettier`, `eslint`, `tsc`) via `child_process`;
4. sends results to the Webview panel for display.

All of this stays entirely within your local VS Code instance and is discarded when the panel is closed.

---

## PR launch

When you click "Push & Create PR", the extension:

1. reads the git remote URL via `git remote get-url origin` and pushes the current branch to its `origin` remote;
2. constructs the PR draft locally from the branch, commits, and PreFlight results;
3. for GitHub, asks the user's authenticated `gh` CLI to create the PR (or opens an existing one); otherwise it opens a pre-filled provider page in the default browser.

This explicit action can send the branch and PR title/body to the configured Git host. The extension itself does not send source code, diff content, telemetry, analytics, or usage data to Mewra.

No data is sent to Mewra.

---

## What is never collected

- Source code bodies or file contents;
- keystrokes or cursor positions;
- workspace folder names;
- personal information;
- IP addresses;
- browser cookies.

---

## Changes to this policy

Any future background or non-user-initiated network functionality will be documented here and in the changelog before release.
