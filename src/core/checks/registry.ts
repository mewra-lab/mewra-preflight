import type { CheckRunner } from "./check-contract.js";

// MARK: - Types

export type Disposable = {
  dispose(): void;
};

export type ContributedCheckSettings = Record<
  string,
  { enabled?: boolean; severity?: "error" | "warning" }
>;

// MARK: - Registry

export class CheckRegistry {
  private readonly contributedChecks = new Map<string, CheckRunner>();

  register(check: CheckRunner): Disposable {
    if (this.contributedChecks.has(check.id)) {
      throw new Error(`Check with id "${check.id}" is already registered.`);
    }

    this.contributedChecks.set(check.id, check);

    return {
      dispose: () => {
        this.contributedChecks.delete(check.id);
      },
    };
  }

  getContributedChecks(): CheckRunner[] {
    return Array.from(this.contributedChecks.values());
  }

  getConfiguredChecks(settings: ContributedCheckSettings = {}): CheckRunner[] {
    return this.getContributedChecks()
      .filter((check) => settings[check.id]?.enabled !== false)
      .map((check) => {
        const severity = settings[check.id]?.severity;
        return severity === "error" || severity === "warning"
          ? { ...check, severity }
          : check;
      });
  }

  clear(): void {
    this.contributedChecks.clear();
  }
}
