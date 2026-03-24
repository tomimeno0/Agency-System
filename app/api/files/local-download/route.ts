import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { badRequest, forbidden, notFound } from "@/lib/http/errors";
import { env } from "@/lib/env";
import { verifyLocalSignature } from "@/lib/storage/r2";

function getSafeSource(storageKey: string): string {
  const baseDir = path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR);
  const source = path.resolve(baseDir, storageKey);
  if (!source.startsWith(baseDir)) {
    badRequest("Invalid storage key");
  }
  return source;
}

export const GET = defineRoute(async (request) => {
  if (env.STORAGE_PROVIDER !== "local") {
    forbidden("Local storage is disabled");
  }

  const url = new URL(request.url);
  const storageKey = url.searchParams.get("key");
  const mime = url.searchParams.get("mime") ?? "application/octet-stream";
  const fileName = url.searchParams.get("name") ?? "file";
  const expRaw = url.searchParams.get("exp");
  const signature = url.searchParams.get("sig");

  if (!storageKey || !expRaw || !signature) {
    badRequest("Missing download signature parameters");
  }

  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    badRequest("Download URL expired");
  }

  const payload = `download:${storageKey}:${mime}:${fileName}:${expiresAt}`;
  if (!verifyLocalSignature(payload, signature)) {
    badRequest("Invalid download signature");
  }

  const source = getSafeSource(storageKey);
  let file: Buffer;
  try {
    file = await readFile(source);
  } catch {
    notFound("File not found");
  }

  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "_")}"`,
    },
  });
});
