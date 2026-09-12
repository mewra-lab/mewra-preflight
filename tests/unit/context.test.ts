import { describe, it, expect } from "vitest";
import { createPreFlightContext } from "../../src/core/checks/context.js";

describe("createPreFlightContext — resolveTool", () => {
  it("resolves node binary from system path", async () => {
    const context = createPreFlightContext(process.cwd());
    const nodePath = await context.resolveTool("node");
    expect(nodePath).not.toBeNull();
    expect(typeof nodePath).toBe("string");
  });

  it("returns null for non-existent tool", async () => {
    const context = createPreFlightContext(process.cwd());
    const missing = await context.resolveTool("non_existent_tool_12345");
    expect(missing).toBeNull();
  });
});

describe("createPreFlightContext — runCommand", () => {
  it("executes safe commands with fixed arguments", async () => {
    const context = createPreFlightContext(process.cwd());
    const res = await context.runCommand("node", [
      "-e",
      "console.log('hello')",
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("hello");
  });

  it("captures non-zero exit code without uncaught exception", async () => {
    const context = createPreFlightContext(process.cwd());
    const res = await context.runCommand("node", ["-e", "process.exit(2)"]);
    expect(res.code).toBe(2);
  });
});
