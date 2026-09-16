import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  createPreFlightContext,
  resolveTrustedTool,
} from "../../src/core/checks/context.js";

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

describe("createPreFlightContext — resolveTrustedTool", () => {
  it("never resolves an executable from the opened workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "mewra-preflight-"));
    const toolDirectory = join(workspace, "node_modules", ".bin");
    const toolPath = join(toolDirectory, "mewra-untrusted-scanner");

    try {
      await mkdir(toolDirectory, { recursive: true });
      await writeFile(toolPath, "#!/bin/sh\nexit 0");
      await chmod(toolPath, 0o755);
      const context = createPreFlightContext(workspace);

      await expect(
        context.resolveTrustedTool?.("mewra-untrusted-scanner"),
      ).resolves.toBeNull();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects a trusted-location symlink that points into the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "mewra-preflight-"));
    const trustedDirectory = await mkdtemp(join(tmpdir(), "mewra-trusted-"));
    const workspaceTool = join(workspace, "mewra-untrusted-scanner");
    const trustedLink = join(trustedDirectory, "mewra-scanner-link");

    try {
      await writeFile(workspaceTool, "#!/bin/sh\nexit 0");
      await chmod(workspaceTool, 0o755);
      await symlink(workspaceTool, trustedLink);

      await expect(
        resolveTrustedTool(workspace, "mewra-untrusted-scanner", [trustedLink]),
      ).resolves.toBeNull();
    } finally {
      await Promise.all([
        rm(workspace, { recursive: true, force: true }),
        rm(trustedDirectory, { recursive: true, force: true }),
      ]);
    }
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

  it("handles command timeout cleanly", async () => {
    const context = createPreFlightContext(process.cwd());
    const res = await context.runCommand(
      "node",
      ["-e", "setTimeout(() => {}, 200)"],
      undefined,
      50,
    );
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Command timed out.");
  });
});
