import type { CheckRunner } from "./check-contract.js";

// MARK: - Types

export type Disposable = {
  dispose(): void;
};

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

  clear(): void {
    this.contributedChecks.clear();
  }
}
