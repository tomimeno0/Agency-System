import path from "path";
import { unprocessable } from "@/lib/http/errors";

const DANGEROUS_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".ps1",
  ".js",
  ".vbs",
  ".msi",
  ".scr",
  ".jar",
  ".com",
  ".sh",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".zip": "application/zip",
  ".pdf": "application/pdf",
};

const ALLOWED_MIME = new Set<string>([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "audio/mpeg",
  "audio/wav",
  "application/zip",
  "application/pdf",
  "application/octet-stream",
]);

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  return true;
}

export function getMimeFromExtension(fileName: string): string | null {
  const extension = path.extname(fileName || "").toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? null;
}

export function assertSafeFileName(fileName: string): void {
  const extension = path.extname(fileName || "").toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(extension)) {
    unprocessable("Tipo de archivo no permitido por seguridad");
  }
}

export function normalizeDeclaredMime(fileName: string, mimeType: string): string {
  assertSafeFileName(fileName);

  if (!ALLOWED_MIME.has(mimeType)) {
    unprocessable("Unsupported file MIME type");
  }

  const inferredFromExt = getMimeFromExtension(fileName);
  if (mimeType === "application/octet-stream" && inferredFromExt) {
    return inferredFromExt;
  }

  if (inferredFromExt && mimeType !== inferredFromExt) {
    unprocessable("El tipo MIME no coincide con la extension del archivo");
  }

  return mimeType;
}

export function sniffMimeByMagic(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  // MP4 / MOV: ftyp at offset 4.
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand.includes("qt")) return "video/quicktime";
    return "video/mp4";
  }

  // MKV (EBML)
  if (hasPrefix(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return "video/x-matroska";
  }

  // MP3 with ID3 header
  if (hasPrefix(bytes, [0x49, 0x44, 0x33])) {
    return "audio/mpeg";
  }

  // MP3 frame sync
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }

  // WAV
  if (
    hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return "audio/wav";
  }

  // ZIP
  if (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return "application/zip";
  }

  // PDF
  if (hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return "application/pdf";
  }

  return null;
}

export function assertBinaryMatchesType(input: {
  fileName: string;
  declaredMime: string;
  bytes: Uint8Array;
}): string {
  const normalized = normalizeDeclaredMime(input.fileName, input.declaredMime);
  const sniffed = sniffMimeByMagic(input.bytes);
  if (sniffed && sniffed !== normalized) {
    unprocessable("El contenido del archivo no coincide con el tipo declarado");
  }
  return normalized;
}

