import { randomBytes } from "node:crypto";

export function generateNonce(): string {
  return randomBytes(16).toString("base64url");
}
