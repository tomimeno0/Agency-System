import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/http/errors";
import { resetPasswordConfirmSchema } from "@/lib/validation/schemas";
import { hashToken } from "@/lib/security/tokens";
import { hashPassword } from "@/lib/security/password";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const payload = resetPasswordConfirmSchema.parse(await parseJson(request));
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

  const { ip, userAgent } = requestMeta(request);
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
