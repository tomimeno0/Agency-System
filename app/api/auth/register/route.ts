import { Role, UserStatus } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { registerSchema } from "@/lib/validation/schemas";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hashPassword } from "@/lib/security/password";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const payload = registerSchema.parse(await parseJson(request));
  const email = payload.email.toLowerCase();
  const { ip, userAgent } = requestMeta(request);
  const rate = checkRateLimit(`register:${email}:${ip}`, 5, 60_000);

  if (!rate.allowed) {
    await appendAuditLog({
      actorUserId: null,
      action: "auth.register_rate_limited",
      entityType: "User",
      entityId: email,
      metadataJson: { ip },
      ip,
      userAgent,
    });

    return ok({ accepted: true }, requestId);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!existing) {
    const passwordHash = await hashPassword(payload.password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: payload.displayName,
        fullName: payload.fullName,
        role: Role.EDITOR,
        status: UserStatus.PENDING_APPROVAL,
        country: payload.country,
        timezone: payload.timezone ?? "UTC",
      },
      select: { id: true },
    });

    await appendAuditLog({
      actorUserId: user.id,
      action: "auth.register_requested",
      entityType: "User",
      entityId: user.id,
      metadataJson: { email, ip },
      ip,
      userAgent,
    });
  } else {
    await appendAuditLog({
      actorUserId: existing.id,
      action: "auth.register_requested_existing",
      entityType: "User",
      entityId: existing.id,
      metadataJson: { ip },
      ip,
      userAgent,
    });
  }

  return ok({ accepted: true }, requestId);
});
