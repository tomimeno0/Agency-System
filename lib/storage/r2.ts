import { randomUUID } from "crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import { unprocessable } from "@/lib/http/errors";

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "audio/mpeg",
  "audio/wav",
  "application/zip",
  "application/octet-stream",
]);

const client = new S3Client({
  region: env.R2_REGION,
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

function sanitizeName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function validateUpload(mimeType: string, sizeBytes: number): void {
  if (!ALLOWED_MIME.has(mimeType)) {
    unprocessable("Unsupported file MIME type");
  }

  if (sizeBytes > env.UPLOAD_MAX_BYTES) {
    unprocessable(`File exceeds max size of ${env.UPLOAD_MAX_BYTES} bytes`);
  }
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
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: input.storageKey,
    ContentType: input.mimeType,
  });

  return getSignedUrl(client, command, {
    expiresIn: input.expiresInSeconds ?? 300,
  });
}

export async function createSignedDownloadUrl(input: {
  storageKey: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: input.storageKey,
  });

  return getSignedUrl(client, command, {
    expiresIn: input.expiresInSeconds ?? 300,
  });
}
