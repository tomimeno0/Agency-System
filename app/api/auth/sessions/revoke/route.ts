import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { sessionRevokeSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

function getCurrentSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const parts = cookieHeader.split(";").map((part) => part.trim());

  for (const part of parts) {
    if (part.startsWith("next-auth.session-token=")) {
      return decodeURIComponent(part.split("=")[1] ?? "");
    }
    if (part.startsWith("__Secure-next-auth.session-token=")) {
      return decodeURIComponent(part.split("=")[1] ?? "");
    }
  }

  return null;
}

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = sessionRevokeSchema.parse(await parseJson(request));

  let revoked = 0;
  if (payload.scope === "all") {
    const result = await prisma.session.deleteMany({ where: { userId: actor.id } });
    revoked = result.count;
  } else {
    const sessionToken = getCurrentSessionToken(request);
    if (sessionToken) {
      const result = await prisma.session.deleteMany({
        where: {
          userId: actor.id,
          sessionToken,
        },
      });
      revoked = result.count;
    }
  }

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: payload.scope === "all" ? "auth.sessions_revoked_all" : "auth.session_revoked_current",
    entityType: "Session",
    entityId: actor.id,
    metadataJson: { revoked },
    ip,
    userAgent,
  });

  const response = ok({ revoked }, requestId);
  const secure = process.env.NODE_ENV === "production";
  const expires = new Date(0);
  const cookieNames = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
    "authjs.callback-url",
    "__Secure-authjs.callback-url",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
    "authjs.csrf-token",
    "__Host-authjs.csrf-token",
  ];

  for (const cookieName of cookieNames) {
    response.cookies.set(cookieName, "", {
      path: "/",
      httpOnly: cookieName.includes("session-token") || cookieName.includes("csrf-token"),
      sameSite: "lax",
      secure,
      expires,
      maxAge: 0,
    });
  }

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
});
