import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, unauthorized } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/security/tokens";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";
import { twoFactorVerifySchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { dispatchSecurityAlert } from "@/lib/services/security-alerts";

export const POST = defineRoute(async (request, _context, requestId) => {
  const payload = twoFactorVerifySchema.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `2fa:verify:${payload.challengeId}:${ip}`,
    limit: 10,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    unauthorized("Codigo invalido.");
  }

  const challenge = await prisma.twoFactorChallenge.findUnique({
    where: { id: payload.challengeId },
    select: {
      id: true,
      userId: true,
      codeHash: true,
      expiresAt: true,
      usedAt: true,
      attempts: true,
      maxAttempts: true,
    },
  });

  if (!challenge || challenge.usedAt || challenge.expiresAt < new Date()) {
    unauthorized("Codigo invalido.");
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    unauthorized("Codigo invalido.");
  }

  const codeHash = hashToken(payload.code);
  if (codeHash !== challenge.codeHash) {
    const updated = await prisma.twoFactorChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true, maxAttempts: true },
    });
    if (updated.attempts >= updated.maxAttempts) {
      await dispatchSecurityAlert({
        title: "2FA bloqueado por intentos",
        message: `Challenge ${challenge.id} bloqueado por intentos invalidos.`,
        metadataJson: { challengeId: challenge.id, userId: challenge.userId, ip },
      });
    }
    conflict("Codigo invalido.");
  }

  await prisma.twoFactorChallenge.update({
    where: { id: challenge.id },
    data: { verifiedAt: new Date() },
  });

  await appendAuditLog({
    actorUserId: challenge.userId,
    action: "auth.2fa_code_verified",
    entityType: "TwoFactorChallenge",
    entityId: challenge.id,
    metadataJson: { ip },
    ip,
    userAgent,
  });

  return ok({ verified: true }, requestId);
});

