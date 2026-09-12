# Mewra PreFlight — Security Policy

Security is a release-blocking requirement. Mewra PreFlight runs inside a VS Code Webview, spawns child processes to invoke local tools, and communicates across an Extension Host / Webview boundary. These are treated as security-sensitive surfaces.

---

## 1. Security goals

Mewra PreFlight aims to protect:

- the user's source code and workspace from unexpected exfiltration;
- the VS Code extension host from code execution via malicious workspace content;
- the Webview from XSS via check findings derived from workspace content;
- the system from shell injection through `child_process` calls.

---

## 2. Trust boundaries

```text
Workspace source files
        │
        ▼
git diff (child_process — fixed args)
        │ raw patch string
        ▼
CheckRunner[] — pure functions over the patch
        │
        ▼
Zod schema (ExtensionMessageSchema)
        │ validated postMessage
        ▼
Webview (untrusted boundary — sandboxed iframe)
        │ Zod schema (WebviewMessageSchema)
        ▼
Extension Host
```

---

## 3. Threat model

### 3.1 Shell injection via child_process

Risk: workspace input is spliced into a shell command string, allowing code execution.

Controls:

- all `child_process` calls use `execFile` with a fixed argument array;
- branch names, file paths, and tool names are never concatenated into a shell string;
- target branch is taken from VS Code configuration, not from Webview input.

### 3.2 Webview XSS via check findings

Risk: a finding message derived from workspace code becomes executable HTML in the Webview.

Controls:

- strict CSP starting with `default-src 'none'`;
- nonce-only script loading — no `unsafe-inline` scripts;
- no `eval` or `new Function`;
- Preact renders all text content as text nodes, not raw HTML;
- all Webview messages parsed with Zod before acting on them.

### 3.3 Arbitrary command execution via Webview input

Risk: a Webview message triggers an unintended `vscode.commands.executeCommand` call.

Controls:

- `openFile` messages validated by Zod (path is a string, line is a nonnegative integer);
- only known workspace file URIs are opened via `vscode.Uri.file()`;
- no Webview message dispatches to arbitrary command IDs.

---

## 4. Security invariants

Never introduce:

- `eval` or `new Function`;
- broad CSP wildcards (`*`) or `unsafe-inline` scripts;
- shell command strings built from workspace or user input;
- unvalidated Webview messages;
- `innerHTML` assignment with untrusted content;
- network calls from the extension host or Webview (v1 is fully local);
- telemetry or usage analytics.

---

## 5. Reporting a vulnerability

**Please do not publish exploitable vulnerabilities in a public GitHub issue.**

Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) for this repository.

We aim to acknowledge reports within 5 business days and release a fix within 30 days for confirmed issues.

---

## 6. Supported versions

| Version            | Supported             |
| ------------------ | --------------------- |
| latest pre-release | ✅                    |
| older releases     | ❌ — update to latest |
