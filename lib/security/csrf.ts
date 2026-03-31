import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { forbidden } from "@/lib/http/errors";

function safeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const expected = new URL(env.NEXTAUTH_URL);
    const incoming = new URL(origin);
    return expected.protocol === incoming.protocol && expected.host === incoming.host;
  } catch {
    return false;
  }
}

export function requireCsrf(request: NextRequest): void {
  if (!sameOrigin(request)) {
    forbidden("Invalid request origin");
  }

  const tokenFromHeader = request.headers.get("x-csrf-token");
  const tokenFromCookie = request.cookies.get("app-csrf-token")?.value;

  if (tokenFromHeader && tokenFromCookie && safeEquals(tokenFromHeader, tokenFromCookie)) {
    return;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === null) {
    return;
  }

  forbidden("Missing or invalid CSRF token");
}

export function shouldEnforceCsrf(request: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/api/auth/[...nextauth]")) return false;
  if (pathname.startsWith("/api/files/local-upload")) return false;
  return true;
}

