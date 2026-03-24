import { hash, verify } from "@node-rs/argon2";

const PASSWORD_MIN_LENGTH = 7;

export function assertPasswordPolicy(password: string): void {
  const strongEnough = password.length >= PASSWORD_MIN_LENGTH;

  if (!strongEnough) {
    throw new Error("Password must have at least 7 characters.");
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);
  return hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
}

export async function verifyPassword(passwordHash: string, plainPassword: string): Promise<boolean> {
  return verify(passwordHash, plainPassword, {
    algorithm: 2,
  });
}
