import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireRole, requireSessionUser } from "@/lib/auth/session";
import { userCreateSchema } from "@/lib/validation/schemas";
import { hashPassword } from "@/lib/security/password";
import { encryptField } from "@/lib/security/encryption";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { getPagination } from "@/lib/http/query";
import { userSafeSelect } from "@/lib/services/selects";

export const GET = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const { take, skip } = getPagination(request);

  const users = await prisma.user.findMany({
    select: userSafeSelect,
    take,
    skip,
    orderBy: { createdAt: "desc" },
  });

  return ok({ items: users, take, skip }, requestId);
});

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const payload = userCreateSchema.parse(await parseJson(request));

  if (actor.role === Role.ADMIN && payload.role !== Role.EDITOR) {
    forbidden("Admin can only create editor users");
  }

  const passwordHash = await hashPassword(payload.password);
  const encryptedPhone = payload.phone ? encryptField(payload.phone) : null;

  const user = await prisma.user.create({
    data: {
      email: payload.email.toLowerCase(),
      passwordHash,
      displayName: payload.displayName,
      fullName: payload.fullName,
      avatarUrl: payload.avatarUrl,
      role: payload.role,
      country: payload.country,
      timezone: payload.timezone ?? "UTC",
      declaredLevel: payload.declaredLevel,
      softwareStack: payload.softwareStack ?? undefined,
      availabilityText: payload.availabilityText,
      phoneEncrypted: encryptedPhone?.ciphertext,
      phoneKeyVersion: encryptedPhone?.keyVersion,
    },
    select: userSafeSelect,
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "users.create",
    entityType: "User",
    entityId: user.id,
    metadataJson: { createdRole: user.role },
    ip,
    userAgent,
  });

  return ok(user, requestId, 201);
});
