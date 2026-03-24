import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  STORAGE_PROVIDER: z.enum(["local", "r2"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default(".local-storage"),
  APP_ENCRYPTION_KEY_B64: z.string().min(1),
  APP_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  DEFAULT_CURRENCY: z.string().min(3).max(3).default("USD"),
  R2_ENDPOINT: z.string().url().optional(),
  R2_REGION: z.string().default("auto"),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(524288000),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  AI_ASSISTANT_ENABLED: z
    .string()
    .optional()
    .transform((value) => (value ?? "true").toLowerCase() === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${formatted}`);
}

const encryptionKey = Buffer.from(parsed.data.APP_ENCRYPTION_KEY_B64, "base64");
if (encryptionKey.byteLength !== 32) {
  throw new Error("APP_ENCRYPTION_KEY_B64 must decode to exactly 32 bytes.");
}

if (parsed.data.NODE_ENV === "production") {
  const smtpMissing = !parsed.data.SMTP_HOST || !parsed.data.SMTP_PORT || !parsed.data.SMTP_USER || !parsed.data.SMTP_PASS || !parsed.data.SMTP_FROM;
  if (smtpMissing) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM son obligatorios en producción.");
  }
}

if (parsed.data.STORAGE_PROVIDER === "r2") {
  const missingR2 =
    !parsed.data.R2_ENDPOINT ||
    !parsed.data.R2_ACCESS_KEY_ID ||
    !parsed.data.R2_SECRET_ACCESS_KEY ||
    !parsed.data.R2_BUCKET;

  if (missingR2) {
    throw new Error(
      "R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET son obligatorios cuando STORAGE_PROVIDER=r2.",
    );
  }
}

export const env = {
  ...parsed.data,
  encryptionKey,
};
