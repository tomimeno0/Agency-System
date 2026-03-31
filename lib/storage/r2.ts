import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import { unprocessable } from "@/lib/http/errors";
import { normalizeDeclaredMime } from "@/lib/security/file-validation";

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "audio/mpeg",
  "audio/wav",
  "application/zip",
  "application/pdf",
  "application/octet-stream",
]);

const r2Client =
  env.STORAGE_PROVIDER === "r2"
    ? new S3Client({
        region: env.R2_REGION,
        endpoint: env.R2_ENDPOINT,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
          secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
        },
      })
    : null;

function sanitizeName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function signLocalPayload(payload: string): string {
  return createHmac("sha256", env.NEXTAUTH_SECRET).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function verifyLocalSignature(payload: string, signature: string): boolean {
  const expected = signLocalPayload(payload);
  return safeEqual(expected, signature);
}

function buildLocalSignedPath(kind: "upload" | "download", input: {
  storageKey: string;
  mimeType?: string;
  fileName?: string;
  expiresInSeconds?: number;
}): string {
  const expiresAt = Date.now() + (input.expiresInSeconds ?? 300) * 1000;
  const mime = input.mimeType ?? "";
  const fileName = input.fileName ?? "";
  const payload = `${kind}:${input.storageKey}:${mime}:${fileName}:${expiresAt}`;
  const sig = signLocalPayload(payload);
  const basePath =
    kind === "upload" ? "/api/files/local-upload" : "/api/files/local-download";
  const query = new URLSearchParams({
    key: input.storageKey,
    mime,
    name: fileName,
    exp: String(expiresAt),
    sig,
  });
  return `${env.NEXTAUTH_URL}${basePath}?${query.toString()}`;
}

export function validateUpload(mimeType: string, sizeBytes: number, fileName = ""): string {
  const normalizedMime = normalizeDeclaredMime(fileName || "file.bin", mimeType);

  if (!ALLOWED_MIME.has(normalizedMime)) {
    unprocessable("Unsupported file MIME type");
  }

  if (sizeBytes > env.UPLOAD_MAX_BYTES) {
    unprocessable(`File exceeds max size of ${env.UPLOAD_MAX_BYTES} bytes`);
  }

  return normalizedMime;
}

export function buildStorageKey(fileName: string): string {
  const safeName = sanitizeName(fileName);
  return `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
}

export async function createSignedUploadUrl(input: {
  storageKey: string;
  mimeType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  if (env.STORAGE_PROVIDER === "local") {
    return buildLocalSignedPath("upload", input);
  }

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: input.storageKey,
    ContentType: input.mimeType,
  });

  return getSignedUrl(r2Client as S3Client, command, {
    expiresIn: input.expiresInSeconds ?? 300,
  });
}

export async function createSignedDownloadUrl(input: {
  storageKey: string;
  mimeType?: string;
  fileName?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  if (env.STORAGE_PROVIDER === "local") {
    return buildLocalSignedPath("download", input);
  }

  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: input.storageKey,
  });

  return getSignedUrl(r2Client as S3Client, command, {
    expiresIn: input.expiresInSeconds ?? 300,
  });
}
