import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { resetPasswordRequestSchema } from "@/lib/validation/schemas";
import { generateOpaqueToken, hashToken } from "@/lib/security/tokens";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const payload = resetPasswordRequestSchema.parse(await parseJson(request));
  const email = payload.email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  const { ip, userAgent } = requestMeta(request);

  if (user) {
    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    await appendAuditLog({
      actorUserId: user.id,
      action: "auth.password_reset_requested",
      entityType: "User",
      entityId: user.id,
      metadataJson: { ip },
      ip,
      userAgent,
    });

    return ok(
      {
        accepted: true,
        ...(process.env.NODE_ENV !== "production" ? { resetToken: rawToken } : {}),
      },
      requestId,
    );
  }

  await appendAuditLog({
    actorUserId: null,
    action: "auth.password_reset_requested_unknown_email",
    entityType: "User",
    entityId: email,
    metadataJson: { ip },
    ip,
    userAgent,
  });

  return ok({ accepted: true }, requestId);
});
