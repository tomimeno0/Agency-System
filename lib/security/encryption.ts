import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";

export type EncryptedValue = {
  ciphertext: string;
  keyVersion: number;
};

function toUrlBase64(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function fromUrlBase64(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function encryptField(plainText: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, env.encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: `${toUrlBase64(iv)}.${toUrlBase64(authTag)}.${toUrlBase64(encrypted)}`,
    keyVersion: env.APP_ENCRYPTION_KEY_VERSION,
  };
}

export function decryptField(ciphertext: string): string {
  const [ivPart, tagPart, encryptedPart] = ciphertext.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Invalid encrypted field format");
  }

  const iv = fromUrlBase64(ivPart);
  const authTag = fromUrlBase64(tagPart);
  const encrypted = fromUrlBase64(encryptedPart);

  const decipher = createDecipheriv(ALGO, env.encryptionKey, iv);
  decipher.setAuthTag(authTag);

  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString("utf8");
}
