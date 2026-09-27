import type { PreFlightConfigFile } from "../../shared/types.js";

export function createStarterConfig(targetBranch: string): PreFlightConfigFile {
  return {
    targetBranch,
    manualChecklist: [],
  };
}
