import type { CheckRunner } from "../../check-contract.js";
import { prettierCheck } from "./prettier.js";
import { eslintCheck } from "./eslint.js";
import { tscCheck } from "./tsc.js";

export function buildJsTsPack(): CheckRunner[] {
  return [prettierCheck, eslintCheck, tscCheck];
}
