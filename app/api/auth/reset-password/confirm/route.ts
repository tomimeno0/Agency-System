import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/http/errors";
import { resetPasswordConfirmSchema } from "@/lib/validation/schemas";
import { hashToken } from "@/lib/security/tokens";
import { hashPassword } from "@/lib/security/password";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const payload = resetPasswordConfirmSchema.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);
  const rate = checkRateLimitAdvanced({
    key: `reset:confirm:${ip ?? "unknown"}`,
    limit: 20,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    conflict("Too many attempts");
  }
  const tokenHash = hashToken(payload.token);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!resetToken) {
    notFound("Reset token not found");
  }

  if (resetToken.usedAt) {
    conflict("Reset token already used");
  }

  if (resetToken.expiresAt < new Date()) {
    conflict("Reset token expired");
  }

  const passwordHash = await hashPassword(payload.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockUntil: null,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    prisma.session.deleteMany({
      where: { userId: resetToken.userId },
    }),
  ]);

  await appendAuditLog({
    actorUserId: resetToken.userId,
    action: "auth.password_reset_confirmed",
    entityType: "User",
    entityId: resetToken.userId,
    metadataJson: { ip },
    ip,
    userAgent,
  });

  return ok({ success: true }, requestId);
});
