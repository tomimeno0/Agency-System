import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  CSRF_SECRET: z.string().min(16).optional(),
  STORAGE_PROVIDER: z.enum(["local", "r2"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default(".local-storage"),
  APP_ENCRYPTION_KEY_B64: z.string().min(1),
  APP_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  APP_ENCRYPTION_KEY_RING: z.string().optional(),
  DEFAULT_CURRENCY: z.string().min(3).max(3).default("ARS"),
  R2_ENDPOINT: z.string().url().optional(),
  R2_REGION: z.string().default("auto"),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(524288000),
  UPLOAD_MAX_FILES_PER_TASK: z.coerce.number().int().min(30).max(500).default(60),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  SECURITY_ALERT_OWNER_EMAIL: z.string().email().optional(),
  TWO_FA_CODE_TTL_MINUTES: z.coerce.number().int().min(3).max(30).default(10),
  TWO_FA_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  TWO_FA_RESEND_LIMIT: z.coerce.number().int().min(1).max(10).default(3),
  ANTI_BOT_ENABLED: z
    .string()
    .optional()
    .transform((value) => (value ?? "false").toLowerCase() === "true"),
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

const encryptionKeyRing = new Map<number, Buffer>();
encryptionKeyRing.set(parsed.data.APP_ENCRYPTION_KEY_VERSION, encryptionKey);

if (parsed.data.APP_ENCRYPTION_KEY_RING) {
  const entries = parsed.data.APP_ENCRYPTION_KEY_RING.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const [versionRaw, keyRaw] = entry.split(":");
    const version = Number(versionRaw);
    if (!Number.isInteger(version) || version < 1 || !keyRaw) {
      throw new Error("APP_ENCRYPTION_KEY_RING entries must use format version:base64key");
    }
    const key = Buffer.from(keyRaw, "base64");
    if (key.byteLength !== 32) {
      throw new Error(`APP_ENCRYPTION_KEY_RING key for version ${version} must decode to 32 bytes.`);
    }
    if (!encryptionKeyRing.has(version)) {
      encryptionKeyRing.set(version, key);
    }
  }
}

const isNextBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (parsed.data.NODE_ENV === "production" && !isNextBuildPhase) {
  const smtpMissing = !parsed.data.SMTP_HOST || !parsed.data.SMTP_PORT || !parsed.data.SMTP_USER || !parsed.data.SMTP_PASS || !parsed.data.SMTP_FROM;
  if (smtpMissing) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM son obligatorios en produccion.");
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
  CSRF_SECRET: parsed.data.CSRF_SECRET ?? parsed.data.NEXTAUTH_SECRET,
  encryptionKey,
  encryptionKeyRing,
};

