import { createHash, randomBytes } from "crypto";

export function generateOpaqueToken(size = 32): string {
  return randomBytes(size).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
