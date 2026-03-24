import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  APP_ENCRYPTION_KEY_B64: z.string().min(1),
  APP_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  DEFAULT_CURRENCY: z.string().min(3).max(3).default("USD"),
  R2_ENDPOINT: z.string().url(),
  R2_REGION: z.string().default("auto"),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(524288000),
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

export const env = {
  ...parsed.data,
  encryptionKey,
};
