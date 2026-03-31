import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { Role, UserStatus } from "@prisma/client";
import { NextAuthOptions } from "next-auth";
import { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";
import { verifyPassword } from "@/lib/security/password";
import { hashToken } from "@/lib/security/tokens";
import { appendAuditLog } from "@/lib/services/audit";
import { dispatchSecurityAlert } from "@/lib/services/security-alerts";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  challengeId: z.string().cuid(),
  otpCode: z.string().regex(/^\d{6}$/),
});

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type AppJwt = JWT & {
  role?: Role;
  status?: UserStatus;
  sessionVersion?: number;
  invalidSession?: boolean;
};

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
    updateAge: 60 * 60,
  },
  providers: [
    CredentialsProvider({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, req) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const email = parsed.data.email.toLowerCase();
        const ip = req?.headers?.["x-forwarded-for"]?.toString()?.split(",")[0]?.trim() ?? "unknown";
        const rateKey = `login:${email}:${ip}`;
        const rate = checkRateLimitAdvanced({
          key: rateKey,
          limit: 10,
          windowMs: 60_000,
          blockMs: 15 * 60_000,
        });

        if (!rate.allowed) {
          await appendAuditLog({
            actorUserId: null,
            action: "auth.login_rate_limited",
            entityType: "User",
            entityId: email,
            metadataJson: { ip },
          });
          await dispatchSecurityAlert({
            title: "Login rate limited",
            message: `Se detectaron intentos repetidos de login bloqueados para ${email} desde ${ip}.`,
            metadataJson: { email, ip, blockedUntil: rate.blockedUntil },
          });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          await appendAuditLog({
            actorUserId: null,
            action: "auth.login_user_not_found",
            entityType: "User",
            entityId: email,
            metadataJson: { ip },
          });
          return null;
        }

        if (
          user.status === UserStatus.PENDING_APPROVAL ||
          user.status === UserStatus.INACTIVE ||
          user.status === UserStatus.LOCKED
        ) {
          return null;
        }

        if (user.lockUntil && user.lockUntil > new Date()) {
          await appendAuditLog({
            actorUserId: user.id,
            action: "auth.login_blocked",
            entityType: "User",
            entityId: user.id,
            metadataJson: { lockUntil: user.lockUntil.toISOString(), ip },
          });
          return null;
        }

        const validPassword = await verifyPassword(user.passwordHash, parsed.data.password);

        if (!validPassword) {
          const nextFailedAttempts = user.failedLoginAttempts + 1;
          const shouldLock = nextFailedAttempts >= MAX_LOGIN_ATTEMPTS;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: shouldLock ? 0 : nextFailedAttempts,
              lockUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
            },
          });

          await appendAuditLog({
            actorUserId: user.id,
            action: shouldLock ? "auth.login_failed_locked" : "auth.login_failed",
            entityType: "User",
            entityId: user.id,
            metadataJson: {
              attempts: nextFailedAttempts,
              ip,
            },
          });

          if (shouldLock) {
            await dispatchSecurityAlert({
              title: "Cuenta bloqueada por intentos fallidos",
              message: `La cuenta ${user.email} fue bloqueada temporalmente por multiples intentos fallidos.`,
              metadataJson: { userId: user.id, ip },
            });
          }

          return null;
        }

        const challenge = await prisma.twoFactorChallenge.findUnique({
          where: { id: parsed.data.challengeId },
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

        if (!challenge || challenge.userId !== user.id || challenge.usedAt || challenge.expiresAt < new Date()) {
          await appendAuditLog({
            actorUserId: user.id,
            action: "auth.2fa_challenge_invalid",
            entityType: "TwoFactorChallenge",
            entityId: parsed.data.challengeId,
            metadataJson: { ip },
          });
          return null;
        }

        if (challenge.attempts >= challenge.maxAttempts) {
          await appendAuditLog({
            actorUserId: user.id,
            action: "auth.2fa_max_attempts_reached",
            entityType: "TwoFactorChallenge",
            entityId: challenge.id,
            metadataJson: { ip, attempts: challenge.attempts },
          });
          await dispatchSecurityAlert({
            title: "2FA bloqueado por intentos",
            message: `Se alcanzo el maximo de intentos 2FA para ${user.email}.`,
            metadataJson: { userId: user.id, challengeId: challenge.id, ip },
          });
          return null;
        }

        const otpHash = hashToken(parsed.data.otpCode);
        if (otpHash !== challenge.codeHash) {
          await prisma.twoFactorChallenge.update({
            where: { id: challenge.id },
            data: { attempts: { increment: 1 } },
          });
          await appendAuditLog({
            actorUserId: user.id,
            action: "auth.2fa_code_invalid",
            entityType: "TwoFactorChallenge",
            entityId: challenge.id,
            metadataJson: { ip },
          });
          return null;
        }

        await prisma.twoFactorChallenge.update({
          where: { id: challenge.id },
          data: {
            verifiedAt: new Date(),
            usedAt: new Date(),
          },
        });

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockUntil: null,
            lastLoginAt: new Date(),
          },
        });

        await appendAuditLog({
          actorUserId: user.id,
          action: "auth.login_success",
          entityType: "User",
          entityId: user.id,
          metadataJson: { ip },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          role: user.role,
          status: user.status,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      const appToken = token as AppJwt;
      if (user) {
        appToken.role = user.role as Role;
        appToken.status = user.status as UserStatus;
        appToken.sessionVersion = Number(user.sessionVersion ?? 1);
        appToken.invalidSession = false;
      }

      if (appToken.sub) {
        const liveUser = await prisma.user.findUnique({
          where: { id: appToken.sub },
          select: {
            role: true,
            status: true,
            sessionVersion: true,
          },
        });

        if (!liveUser || liveUser.status !== UserStatus.ACTIVE) {
          appToken.invalidSession = true;
          return appToken;
        }

        if (appToken.sessionVersion !== liveUser.sessionVersion) {
          appToken.invalidSession = true;
          return appToken;
        }

        appToken.role = liveUser.role;
        appToken.status = liveUser.status;
        appToken.sessionVersion = liveUser.sessionVersion;
        appToken.invalidSession = false;
      }
      return appToken;
    },
    session: async ({ session, token }) => {
      const appToken = token as AppJwt;
      if (appToken.invalidSession) {
        return null as never;
      }
      if (session.user) {
        session.user.id = appToken.sub ?? session.user.id;
        session.user.role = appToken.role ?? Role.EDITOR;
        session.user.status = appToken.status ?? UserStatus.ACTIVE;
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  events: {
    signOut: async ({ token, session }) => {
      logger.info({ userId: session?.user?.id ?? token?.sub }, "User signed out");
      await appendAuditLog({
        actorUserId: session?.user?.id ?? token?.sub ?? null,
        action: "auth.logout",
        entityType: "Session",
        entityId: null,
      });
    },
  },
};
