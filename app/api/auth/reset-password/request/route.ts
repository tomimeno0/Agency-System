import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { ApiError } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { resetPasswordRequestSchema } from "@/lib/validation/schemas";
import { generateOpaqueToken, hashToken } from "@/lib/security/tokens";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { sendResetPasswordEmail, smtpConfigured } from "@/lib/services/email";

export const POST = defineRoute(async (request, _context, requestId) => {
  if (!smtpConfigured()) {
    throw new ApiError(
      503,
      "SMTP_NOT_CONFIGURED",
      "SMTP no esta configurado. Configura SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM.",
    );
  }

  const payload = resetPasswordRequestSchema.parse(await parseJson(request));
  const email = payload.email.toLowerCase();
  const { ip, userAgent } = requestMeta(request);
  const rate = checkRateLimitAdvanced({
    key: `reset:request:${email}:${ip}`,
    limit: 6,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    return ok({ accepted: true }, requestId);
  }

  const user = await prisma.user.findUnique({ where: { email } });

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

    await sendResetPasswordEmail({ to: user.email, resetToken: rawToken });

    await appendAuditLog({
      actorUserId: user.id,
      action: "auth.password_reset_requested",
      entityType: "User",
      entityId: user.id,
      metadataJson: { ip },
      ip,
      userAgent,
    });

    return ok({ accepted: true }, requestId);
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
