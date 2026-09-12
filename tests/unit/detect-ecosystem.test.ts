import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
}));

import { access } from "node:fs/promises";
import {
  detectEcosystem,
  detectActiveEcosystems,
} from "../../src/core/ecosystem/detect-ecosystem.js";

const mockAccess = vi.mocked(access);

beforeEach(() => {
  mockAccess.mockReset();
});

describe("detectEcosystem", () => {
  it("detects js-ts when package.json exists", async () => {
    mockAccess.mockImplementation(async (path) => {
      if (String(path).endsWith("package.json")) return undefined;
      throw new Error("not found");
    });
    const result = await detectEcosystem("/workspace");
    expect(result).toBe("js-ts");
  });

  it("detects go when go.mod exists (no package.json)", async () => {
    mockAccess.mockImplementation(async (path) => {
      if (String(path).endsWith("go.mod")) return undefined;
      throw new Error("not found");
    });
    const result = await detectEcosystem("/workspace");
    expect(result).toBe("go");
  });

  it("detects python when uv.lock exists", async () => {
    mockAccess.mockImplementation(async (path) => {
      if (String(path).endsWith("uv.lock")) return undefined;
      throw new Error("not found");
    });
    const result = await detectEcosystem("/workspace");
    expect(result).toBe("python");
  });

  it("returns unknown when no ecosystem file found", async () => {
    mockAccess.mockRejectedValue(new Error("not found"));
    const result = await detectEcosystem("/workspace");
    expect(result).toBe("unknown");
  });

  it("detects multiple active ecosystems simultaneously", async () => {
    mockAccess.mockImplementation(async (path) => {
      const p = String(path);
      if (
        p.endsWith("go.mod") ||
        p.endsWith("package.json") ||
        p.endsWith("uv.lock")
      ) {
        return undefined;
      }
      throw new Error("not found");
    });
    const active = await detectActiveEcosystems("/workspace");
    expect(active).toContain("js-ts");
    expect(active).toContain("go");
    expect(active).toContain("python");
  });
});
