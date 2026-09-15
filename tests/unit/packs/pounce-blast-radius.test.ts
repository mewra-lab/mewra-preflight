import { describe, it, expect } from "vitest";
import {
  scanEntryPoints,
  buildMermaidDiagram,
} from "../../../src/core/checks/packs/pounce/entry-point-scanner.js";
import { pounceBlastRadiusCheck } from "../../../src/core/checks/packs/pounce/blast-radius.js";
import type { GitDiff } from "../../../src/shared/types.js";

// MARK: - Fixtures

function makeDiff(paths: string[], rawPatch: string): GitDiff {
  return {
    baseBranch: "main",
    headBranch: "feat/test",
    changedFiles: paths.map((p) => ({ path: p, status: "modified" as const })),
    rawPatch,
    scope: "branch",
  };
}

const EXPRESS_PATCH = `diff --git a/src/routes/user.ts b/src/routes/user.ts
@@ -1,3 +1,6 @@
+router.get('/api/users', handler)
+router.post('/api/users', createUser)
+router.delete('/api/users/:id', deleteUser)
`;

const NEXT_PATCH = `diff --git a/app/api/checkout/route.ts b/app/api/checkout/route.ts
@@ -0,0 +1,4 @@
+export async function POST(req: Request) {
+  return Response.json({ ok: true })
+}
`;

const EMPTY_PATCH = `diff --git a/src/utils/format.ts b/src/utils/format.ts
@@ -1,2 +1,3 @@
+export const format = (x: string) => x.trim()
`;

// MARK: - scanEntryPoints

describe("scanEntryPoints", () => {
  it("detects Express router routes", () => {
    const diff = makeDiff(["src/routes/user.ts"], EXPRESS_PATCH);
    const chips = scanEntryPoints(diff);
    expect(chips.length).toBe(3);
    expect(chips[0]).toMatchObject({ method: "GET", route: "/api/users" });
    expect(chips[1]).toMatchObject({ method: "POST", route: "/api/users" });
    expect(chips[2]).toMatchObject({
      method: "DELETE",
      route: "/api/users/:id",
    });
  });

  it("detects Next.js route handlers and infers route path", () => {
    const diff = makeDiff(["app/api/checkout/route.ts"], NEXT_PATCH);
    const chips = scanEntryPoints(diff);
    expect(chips.length).toBe(1);
    expect(chips[0]).toMatchObject({ method: "POST", route: "/api/checkout" });
  });

  it("detects Laravel routes with explicit HTTP verbs", () => {
    const patch = `diff --git a/routes/api.php b/routes/api.php
@@ -0,0 +1,2 @@
+Route::post('/api/orders', [OrderController::class, 'store']);
+`;
    const diff = makeDiff(["routes/api.php"], patch);
    const chips = scanEntryPoints(diff);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ method: "POST", route: "/api/orders" });
  });

  it("detects attribute-based routes with extracted method", () => {
    const patch = `diff --git a/src/Controller.php b/src/Controller.php
@@ -0,0 +1,2 @@
+#[post("/api/items")]
+`;
    const diff = makeDiff(["src/Controller.php"], patch);
    const chips = scanEntryPoints(diff);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ method: "POST", route: "/api/items" });
  });

  it("detects NestJS route decorators", () => {
    const patch = `diff --git a/src/payments.controller.ts b/src/payments.controller.ts
@@ -0,0 +1,4 @@
+@Get('status')
+@Post('checkout')
+`;
    const diff = makeDiff(["src/payments.controller.ts"], patch);
    const chips = scanEntryPoints(diff);
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ method: "GET", route: "/status" });
    expect(chips[1]).toMatchObject({ method: "POST", route: "/checkout" });
  });

  it("detects Next.js routes in monorepo layout", () => {
    const patch = `diff --git a/apps/web/src/app/page.tsx b/apps/web/src/app/page.tsx
@@ -0,0 +1,3 @@
+export default function Page() {
+  return <div />
+}
+`;
    const diff = makeDiff(["apps/web/src/app/page.tsx"], patch);
    const chips = scanEntryPoints(diff);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ method: "GET", route: "/" });
  });

  it("infers route from Next.js route.ts even if signature was not modified", () => {
    const patch = `diff --git a/apps/web/src/app/api/data/route.ts b/apps/web/src/app/api/data/route.ts
@@ -10,1 +10,2 @@
+const updatedValue = 42;
`;
    const diff = makeDiff(["apps/web/src/app/api/data/route.ts"], patch);
    const chips = scanEntryPoints(diff);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ method: "ANY", route: "/api/data" });
  });

  it("detects Hono routes and chained definitions", () => {
    const patch = `diff --git a/src/index.ts b/src/index.ts
@@ -0,0 +1,6 @@
+app.get('/api/health', (c) => c.text('ok'))
+api.post('/checkout', (c) => c.json({}))
+.delete('/item/:id', (c) => c.text('deleted'))
+hono.all('/webhook', (c) => c.text('ok'))
+app.on('GET', '/custom', (c) => c.text('ok'))
+`;
    const diff = makeDiff(["src/index.ts"], patch);
    const chips = scanEntryPoints(diff);
    expect(chips).toHaveLength(5);
    expect(chips[0]).toMatchObject({ method: "GET", route: "/api/health" });
    expect(chips[1]).toMatchObject({ method: "POST", route: "/checkout" });
    expect(chips[2]).toMatchObject({ method: "DELETE", route: "/item/:id" });
    expect(chips[3]).toMatchObject({ method: "ALL", route: "/webhook" });
    expect(chips[4]).toMatchObject({ method: "GET", route: "/custom" });
  });

  it("returns empty array when no entry points found", () => {
    const diff = makeDiff(["src/utils/format.ts"], EMPTY_PATCH);
    const chips = scanEntryPoints(diff);
    expect(chips).toHaveLength(0);
  });

  it("skips deleted files", () => {
    const diff = {
      baseBranch: "main",
      headBranch: "feat/test",
      changedFiles: [
        { path: "src/routes/user.ts", status: "deleted" as const },
      ],
      rawPatch: EXPRESS_PATCH,
      scope: "branch" as const,
    };
    const chips = scanEntryPoints(diff);
    expect(chips).toHaveLength(0);
  });
});

// MARK: - buildMermaidDiagram

describe("buildMermaidDiagram", () => {
  it("builds a valid mermaid diagram with chips", () => {
    const chips = [
      { method: "GET", route: "/api/users", file: "src/routes/user.ts" },
    ];
    const diagram = buildMermaidDiagram(chips, ["src/routes/user.ts"]);
    expect(diagram).toContain("graph TD");
    expect(diagram).toContain("GET /api/users");
  });

  it("produces a placeholder diagram when no chips or files", () => {
    const diagram = buildMermaidDiagram([], []);
    expect(diagram).toContain("No entry points detected");
  });
});

// MARK: - pounceBlastRadiusCheck

describe("pounceBlastRadiusCheck", () => {
  it("skips diffs with no route files", () => {
    const diff = makeDiff(["README.md"], "");
    expect(pounceBlastRadiusCheck.appliesTo(diff)).toBe(false);
  });

  it("applies to diffs with .ts files", () => {
    const diff = makeDiff(["src/api/route.ts"], "");
    expect(pounceBlastRadiusCheck.appliesTo(diff)).toBe(true);
  });

  it("returns pass with no routes detected", async () => {
    const diff = makeDiff(["src/utils/format.ts"], EMPTY_PATCH);
    const context = {
      workspaceRoot: "/workspace",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };
    const result = await pounceBlastRadiusCheck.run(diff, context);
    expect(result.status).toBe("pass");
    expect(result.findings).toHaveLength(0);
    expect(result.mermaid).toBeUndefined();
  });

  it("returns warning with routes and mermaid diagram when entry points detected", async () => {
    const diff = makeDiff(["src/routes/user.ts"], EXPRESS_PATCH);
    const context = {
      workspaceRoot: "/workspace",
      resolveTool: async () => null,
      runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    };
    const result = await pounceBlastRadiusCheck.run(diff, context);
    expect(result.status).toBe("warning");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.mermaid).toContain("graph TD");
    expect(result.routes).toBeDefined();
    expect(result.routes!.length).toBeGreaterThan(0);
  });
});
