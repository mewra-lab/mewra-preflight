import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
}));

import { access } from "node:fs/promises";
import { detectEcosystem } from "../../src/core/ecosystem/detect-ecosystem.js";

const mockAccess = vi.mocked(access);

beforeEach(() => {
  mockAccess.mockReset();
});

describe("detectEcosystem", () => {
  it("detects js-ts when package.json exists", async () => {
    mockAccess.mockResolvedValueOnce(undefined);
    const result = await detectEcosystem("/workspace");
    expect(result).toBe("js-ts");
  });

  it("detects go when go.mod exists (no package.json)", async () => {
    mockAccess
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce(undefined);
    const result = await detectEcosystem("/workspace");
    expect(result).toBe("go");
  });

  it("returns unknown when no ecosystem file found", async () => {
    mockAccess.mockRejectedValue(new Error("not found"));
    const result = await detectEcosystem("/workspace");
    expect(result).toBe("unknown");
  });
});
