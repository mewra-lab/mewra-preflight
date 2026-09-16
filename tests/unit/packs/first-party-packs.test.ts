import { describe, expect, it } from "vitest";
import { buildOrmCostSentryPack } from "../../../src/core/checks/packs/orm-cost-sentry/index.js";
import { buildStyleGuardianPack } from "../../../src/core/checks/packs/style-guardian/index.js";
import type { GitDiff } from "../../../src/shared/types.js";

function makeDiff(paths: string[], rawPatch: string): GitDiff {
  return {
    baseBranch: "main",
    headBranch: "feat/test",
    changedFiles: paths.map((path) => ({ path, status: "modified" })),
    rawPatch,
  };
}

describe("ORM Cost Sentry", () => {
  it("warns about a likely ORM query in a loop", async () => {
    const check = buildOrmCostSentryPack()[0]!;
    const result = await check.run(
      makeDiff(
        ["src/orders.ts"],
        "+++ b/src/orders.ts\n@@ -1,0 +1,2 @@\n+for (const order of orders) {\n+  await prisma.payment.findMany({ where: { orderId: order.id } });",
      ),
      {} as never,
    );

    expect(result.status).toBe("warning");
    expect(result.findings).toHaveLength(1);
  });

  it("warns about destructive migration statements", async () => {
    const check = buildOrmCostSentryPack()[1]!;
    const result = await check.run(
      makeDiff(
        ["migrations/2026_drop_sessions.sql"],
        "+++ b/migrations/2026_drop_sessions.sql\n@@ -1,0 +1 @@\n+DROP TABLE sessions;",
      ),
      {} as never,
    );

    expect(result.status).toBe("warning");
  });
});

describe("Style Guardian", () => {
  it("warns about conflicting Tailwind utilities in a changed template", async () => {
    const check = buildStyleGuardianPack()[0]!;
    const result = await check.run(
      makeDiff(
        ["src/card.tsx"],
        '+++ b/src/card.tsx\n@@ -1,0 +1 @@\n+<div className="bg-red-500 bg-blue-500 p-2 p-4" />',
      ),
      {} as never,
    );

    expect(result.status).toBe("warning");
    expect(result.findings[0]?.message).toContain("bg-red-500 / bg-blue-500");
  });

  it("passes distinct Tailwind utilities", async () => {
    const check = buildStyleGuardianPack()[0]!;
    const result = await check.run(
      makeDiff(
        ["src/card.tsx"],
        '+++ b/src/card.tsx\n@@ -1,0 +1 @@\n+<div className="bg-blue-500 p-4 text-white" />',
      ),
      {} as never,
    );

    expect(result.status).toBe("pass");
  });
});
