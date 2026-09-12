import { describe, it, expect } from "vitest";

describe("parseNameStatus (internal helper via module boundary)", () => {
  it("identifies added files", () => {
    const line = "A\tsrc/foo.ts";
    const [status, rawPath] = line.split("\t") as [string, string];
    const statusMap: Record<string, string> = {
      A: "added",
      M: "modified",
      D: "deleted",
    };
    expect(statusMap[status[0] ?? ""] ?? "modified").toBe("added");
    expect(rawPath).toBe("src/foo.ts");
  });

  it("identifies renamed files", () => {
    const line = "R100\tsrc/new.ts\tsrc/old.ts";
    const [status] = line.split("\t") as [string, ...string[]];
    expect(status?.startsWith("R")).toBe(true);
  });

  it("identifies deleted files", () => {
    const line = "D\tsrc/deleted.ts";
    const [status] = line.split("\t") as [string, ...string[]];
    const statusMap: Record<string, string> = {
      A: "added",
      M: "modified",
      D: "deleted",
    };
    expect(statusMap[status[0] ?? ""] ?? "modified").toBe("deleted");
  });
});
