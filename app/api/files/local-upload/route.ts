import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { badRequest, forbidden } from "@/lib/http/errors";
import { env } from "@/lib/env";
import { verifyLocalSignature } from "@/lib/storage/r2";

function getSafeDestination(storageKey: string): string {
  const baseDir = path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR);
  const destination = path.resolve(baseDir, storageKey);
  if (!destination.startsWith(baseDir)) {
    badRequest("Invalid storage key");
  }
  return destination;
}

export const PUT = defineRoute(async (request) => {
  if (env.STORAGE_PROVIDER !== "local") {
    forbidden("Local storage is disabled");
  }

  const url = new URL(request.url);
  const storageKey = url.searchParams.get("key");
  const mime = url.searchParams.get("mime") ?? "";
  const fileName = url.searchParams.get("name") ?? "";
  const expRaw = url.searchParams.get("exp");
  const signature = url.searchParams.get("sig");

  if (!storageKey || !expRaw || !signature) {
    badRequest("Missing upload signature parameters");
  }

  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    badRequest("Upload URL expired");
  }

  const payload = `upload:${storageKey}:${mime}:${fileName}:${expiresAt}`;
  if (!verifyLocalSignature(payload, signature)) {
    badRequest("Invalid upload signature");
  }

  const destination = getSafeDestination(storageKey);
  await mkdir(path.dirname(destination), { recursive: true });
  const bytes = Buffer.from(await request.arrayBuffer());
  await writeFile(destination, bytes);

  return new NextResponse(null, { status: 200 });
});
