# Mewra PreFlight — Privacy

Mewra PreFlight is a local-first VS Code extension. It runs `git diff` and local code quality tools inside your workspace, renders results in a Webview panel, and operates entirely on your machine.

---

## Default privacy promise

Mewra PreFlight:

- does **not** require an account;
- does **not** send telemetry, analytics, or usage data to Mewra or any third party;
- does **not** upload your source code, file paths, or diff content to any server;
- does **not** make network requests of any kind (v1 is 100% offline);
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

When you click "Open Pull Request", the extension:

1. reads the git remote URL via `git remote get-url origin`;
2. constructs a PR URL from the remote URL and current branch;
3. opens the URL in your default browser via `vscode.env.openExternal`.

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

If a future version introduces network functionality, it will be documented here and in the changelog before release, and will require explicit user consent.
