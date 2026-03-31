import { UserStatus } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { unauthorized } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/security/password";
import { hashToken } from "@/lib/security/tokens";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";
import { twoFactorRequestSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { sendTwoFactorCodeEmail, smtpConfigured } from "@/lib/services/email";

function generateOtpCode(): string {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

export const POST = defineRoute(async (request, _context, requestId) => {
  const payload = twoFactorRequestSchema.parse(await parseJson(request));
  const email = payload.email.toLowerCase();
  const { ip, userAgent } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `2fa:request:${email}:${ip}`,
    limit: 6,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    unauthorized("No se pudo iniciar sesion.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      status: true,
      lockUntil: true,
    },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    unauthorized("No se pudo iniciar sesion.");
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    unauthorized("No se pudo iniciar sesion.");
  }

  const validPassword = await verifyPassword(user.passwordHash, payload.password);
  if (!validPassword) {
    unauthorized("No se pudo iniciar sesion.");
  }
  if (!smtpConfigured()) {
    unauthorized("2FA por email no disponible.");
  }

  const code = generateOtpCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + env.TWO_FA_CODE_TTL_MINUTES * 60_000);

  const challenge = await prisma.twoFactorChallenge.create({
    data: {
      userId: user.id,
      emailSnapshot: user.email,
      codeHash,
      expiresAt,
      maxAttempts: env.TWO_FA_MAX_ATTEMPTS,
    },
    select: { id: true },
  });

  await sendTwoFactorCodeEmail({
    to: user.email,
    code,
    expiresMinutes: env.TWO_FA_CODE_TTL_MINUTES,
  });

  await appendAuditLog({
    actorUserId: user.id,
    action: "auth.2fa_challenge_requested",
    entityType: "TwoFactorChallenge",
    entityId: challenge.id,
    metadataJson: { ip, expiresAt: expiresAt.toISOString() },
    ip,
    userAgent,
  });

  return ok(
    {
      challengeId: challenge.id,
      expiresInSeconds: env.TWO_FA_CODE_TTL_MINUTES * 60,
    },
    requestId,
  );
});
