import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { badRequest } from "@/lib/http/errors";
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
    if (!sessionToken) {
      badRequest("Current session token not found in cookies");
    }

    const result = await prisma.session.deleteMany({
      where: {
        userId: actor.id,
        sessionToken,
      },
    });
    revoked = result.count;
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

  return ok({ revoked }, requestId);
});
