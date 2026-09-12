import { describe, it, expect } from "vitest";

function remoteToHttps(remoteUrl: string): string {
  return remoteUrl
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "");
}

describe("remoteToHttps", () => {
  it("converts SSH remote to HTTPS", () => {
    expect(remoteToHttps("git@github.com:mewra-lab/mewra-preflight.git")).toBe(
      "https://github.com/mewra-lab/mewra-preflight",
    );
  });

  it("leaves HTTPS remote unchanged except stripping .git", () => {
    expect(
      remoteToHttps("https://github.com/mewra-lab/mewra-preflight.git"),
    ).toBe("https://github.com/mewra-lab/mewra-preflight");
  });

  it("handles remote without .git suffix", () => {
    expect(remoteToHttps("git@gitlab.com:org/repo")).toBe(
      "https://gitlab.com/org/repo",
    );
  });
});
