import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitDiff } from "../../src/shared/types.js";

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
}));

import { access, readdir } from "node:fs/promises";
import {
  detectEcosystem,
  detectActiveEcosystems,
} from "../../src/core/ecosystem/detect-ecosystem.js";

const mockAccess = vi.mocked(access);
const mockReaddir = vi.mocked(readdir);

beforeEach(() => {
  mockAccess.mockReset();
  mockReaddir.mockReset();
  mockReaddir.mockResolvedValue([]);
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

  it("detects python when .python-version exists", async () => {
    mockAccess.mockImplementation(async (path) => {
      if (String(path).endsWith(".python-version")) return undefined;
      throw new Error("not found");
    });
    const result = await detectEcosystem("/workspace");
    expect(result).toBe("python");
  });

  it("detects js-ts in monorepo apps/web/package.json", async () => {
    mockAccess.mockImplementation(async (path) => {
      if (String(path).endsWith("apps/web/package.json")) return undefined;
      throw new Error("not found");
    });
    const result = await detectEcosystem("/workspace");
    expect(result).toBe("js-ts");
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

  it("detects ecosystem from diff changedFiles", async () => {
    mockAccess.mockRejectedValue(new Error("not found"));
    const diff: GitDiff = {
      baseBranch: "main",
      headBranch: "feat/test",
      changedFiles: [
        { path: "apps/web/src/components/Timeline.tsx", status: "modified" },
      ],
      rawPatch: "",
    };
    const active = await detectActiveEcosystems("/workspace", diff);
    expect(active).toContain("js-ts");
  });
});
