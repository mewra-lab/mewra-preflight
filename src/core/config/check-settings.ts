import type { CheckRunner } from "../checks/check-contract.js";
import type {
  PreFlightConfigFile,
  CheckSettings,
  EcosystemSettings,
} from "../../shared/types.js";
import { doesFileMatch } from "../checks/manual-evaluator.js";

const slots: Record<string, keyof EcosystemSettings> = {
  "js-ts:prettier": "format",
  "js-ts:eslint": "lint",
  "js-ts:tsc": "typecheck",
  "go:gofmt": "format",
  "go:govet": "vet",
  "go:golangci-lint": "lint",
  "python:format": "format",
  "python:lint": "lint",
  "python:mypy": "typecheck",
  "php:cs-fixer": "format",
  "php:analyze": "analyze",
};

export function getCheckSettings(
  checkId: string,
  pack: string,
  config: PreFlightConfigFile | null,
): CheckSettings | undefined {
  const slot = checkId.endsWith(":test-pairing")
    ? "testPairing"
    : slots[checkId];
  if (!slot || slot === "enabled") return undefined;
  return config?.ecosystems?.[pack]?.[slot];
}
const allowedTools: Record<string, string[]> = {
  "js-ts:prettier": ["prettier"],
  "js-ts:eslint": ["eslint"],
  "js-ts:tsc": ["tsc", "vue-tsc"],
  "go:gofmt": ["gofmt"],
  "go:golangci-lint": ["golangci-lint"],
  "python:format": ["ruff", "black"],
  "python:lint": ["ruff", "flake8"],
  "python:mypy": ["mypy"],
  "php:cs-fixer": ["php-cs-fixer"],
  "php:analyze": ["phpstan", "psalm"],
};

export function configureChecks(
  checks: CheckRunner[],
  config: PreFlightConfigFile | null,
): CheckRunner[] {
  return checks.flatMap((check) => {
    const settings = getCheckSettings(check.id, check.pack, config);
    if (settings?.enabled === false) return [];
    if (settings?.tool && !allowedTools[check.id]?.includes(settings.tool)) {
      throw new Error(
        `Unsupported tool for ${check.id}. Choose a supported tool from the configuration schema.`,
      );
    }
    const timeoutMs =
      settings?.timeoutMs ??
      config?.contributedChecks?.[check.id]?.timeoutMs ??
      check.timeoutMs;
    const filter = (diff: Parameters<CheckRunner["run"]>[0]) =>
      settings?.pattern
        ? {
            ...diff,
            changedFiles: diff.changedFiles.filter((file) =>
              doesFileMatch(file.path, settings.pattern!),
            ),
          }
        : diff;
    return [
      {
        ...check,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        appliesTo: (diff) => check.appliesTo(filter(diff)),
        run: (diff, context) =>
          check.run(filter(diff), {
            ...context,
            resolveTool: (name) =>
              settings?.tool &&
              allowedTools[check.id]?.includes(name) &&
              settings.tool !== name
                ? check.id === "js-ts:tsc" && name === "tsc"
                  ? context.resolveTool(settings.tool)
                  : Promise.resolve(null)
                : context.resolveTool(name),
          }),
      },
    ];
  });
}
