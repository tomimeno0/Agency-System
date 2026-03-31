import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, unauthorized } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hashToken } from "@/lib/security/tokens";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";
import { twoFactorResendSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { sendTwoFactorCodeEmail, smtpConfigured } from "@/lib/services/email";

function generateOtpCode(): string {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

export const POST = defineRoute(async (request, _context, requestId) => {
  const payload = twoFactorResendSchema.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `2fa:resend:${payload.challengeId}:${ip}`,
    limit: 5,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    unauthorized("No se pudo reenviar el codigo.");
  }

  if (!smtpConfigured()) {
    conflict("2FA por email no disponible.");
  }

  const challenge = await prisma.twoFactorChallenge.findUniqueOrThrow({
    where: { id: payload.challengeId },
    include: {
      user: { select: { email: true } },
    },
  });

  if (challenge.usedAt || challenge.expiresAt < new Date()) {
    conflict("Challenge expirado.");
  }
  if (challenge.resendCount >= env.TWO_FA_RESEND_LIMIT) {
    conflict("Limite de reenvios alcanzado.");
  }

  const code = generateOtpCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + env.TWO_FA_CODE_TTL_MINUTES * 60_000);

  await prisma.twoFactorChallenge.update({
    where: { id: challenge.id },
    data: {
      codeHash,
      expiresAt,
      attempts: 0,
      resendCount: { increment: 1 },
      verifiedAt: null,
    },
  });

  await sendTwoFactorCodeEmail({
    to: challenge.user.email,
    code,
    expiresMinutes: env.TWO_FA_CODE_TTL_MINUTES,
  });

  await appendAuditLog({
    actorUserId: challenge.userId,
    action: "auth.2fa_code_resent",
    entityType: "TwoFactorChallenge",
    entityId: challenge.id,
    metadataJson: { ip },
    ip,
    userAgent,
  });

  return ok({ resent: true }, requestId);
});

