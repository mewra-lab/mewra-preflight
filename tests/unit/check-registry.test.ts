import { describe, it, expect } from "vitest";
import { CheckRegistry } from "../../src/core/checks/registry.js";
import type { CheckRunner } from "../../src/core/checks/check-contract.js";

const dummyCheck: CheckRunner = {
  id: "mewra-style-guardian:tailwind",
  label: "Tailwind Conflicts",
  severity: "warning",
  pack: "contributed",
  appliesTo: () => true,
  run: async () => ({ status: "pass", findings: [] }),
};

describe("CheckRegistry", () => {
  it("registers contributed checks and returns disposable", () => {
    const registry = new CheckRegistry();
    expect(registry.getContributedChecks().length).toBe(0);

    const disposable = registry.register(dummyCheck);
    expect(registry.getContributedChecks().length).toBe(1);
    expect(registry.getContributedChecks()[0]?.id).toBe(dummyCheck.id);

    disposable.dispose();
    expect(registry.getContributedChecks().length).toBe(0);
  });

  it("prevents duplicate check id registration", () => {
    const registry = new CheckRegistry();
    registry.register(dummyCheck);
    expect(() => registry.register(dummyCheck)).toThrowError();
  });
});
