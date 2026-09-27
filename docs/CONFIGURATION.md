# Configuration and exceptions

## Start without configuration

Run PreFlight in your repository. Ecosystems and installed tools are detected automatically. Missing tools appear as not configured, not as a successful check. Dependency Guard and Pounce require their companion extensions; configuration alone does not install them.

Use the dashboard settings button or `Mewra PreFlight: Open Configuration`. The starter preserves the configured target branch and leaves the manual checklist empty. Existing files, even empty or invalid ones, are never replaced.

The installed extension provides schema completion for `.mewra-preflight.json` offline. Use Ctrl+Space to discover fields. The example file is valid JSON without comments or trailing commas. Comments are accepted by the loader, but trailing commas are not; plain JSON avoids editor inconsistencies. Unknown fields and invalid values stop the run with a field-specific error instead of silently reverting to defaults.

## Override only what you need

This example forces Vue type checking and gives ESLint a longer command timeout. Other ecosystems retain automatic detection.

```json
{
  "targetBranch": "develop",
  "ecosystems": {
    "js-ts": {
      "lint": { "enabled": true, "timeoutMs": 60000 },
      "typecheck": { "tool": "vue-tsc", "enabled": true }
    }
  },
  "manualChecklist": []
}
```

Omit `tool` to keep auto-detection. Set an individual check's `enabled` to false to disable it, or an ecosystem's `enabled` to false to disable that pack. Timeouts are milliseconds from 1 to 600000. Do not add credentials to this file.

Companion settings use check IDs rather than extension IDs:

```json
{
  "contributedChecks": {
    "pounce:blast-radius": { "enabled": true, "severity": "warning" },
    "mewra-dependency-guard:security-scan": {
      "enabled": true,
      "severity": "error"
    },
    "dependency-guard:unsafe-source": { "enabled": true, "severity": "error" }
  }
}
```

PreFlight remains diff-scoped: enabling a dependency check does not force a full repository scan when no lockfile changed. Use the companion's full scan for a dependency inventory independent of your diff.

## Ignore narrowly

Create `.preflightignore` in the repository root. There are no implicit exceptions added by the example. Prefer `path: check-id` when only one finding is intentional, especially for fake test credentials. Verify that the value really is a fixture before ignoring it; never exclude all tests from secret detection.

```text
tests/fixtures/fake-credentials.ts: universal:no-env-leak
scripts/seed.ts: universal:no-console-log
src/legacy/**: js-ts:eslint
```

Rules without a target exclude matching files from every diff check, including secret detection and dependency checks. Pack names can target a whole pack; `*` targets all checks and should be used cautiously.

Supported globs: `*`, `**`, `?`, optional leading `/`, and trailing `/` for a directory tree. Patterns with `/` are relative to the repository root; bare file patterns match at any depth. `**/` can match zero directories. Use full-line `#` comments. Negation (`!`), character classes, extglobs, and inline comments are not supported. An unsupported negation rule produces an actionable error.

Review ignored findings as part of code review. This file filters the PreFlight diff, not a standalone full scan's vulnerability suppression policy.
