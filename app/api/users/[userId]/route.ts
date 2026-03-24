import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireRole, requireSessionUser } from "@/lib/auth/session";
import { userUpdateSchema } from "@/lib/validation/schemas";
import { encryptField } from "@/lib/security/encryption";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { userSafeSelect } from "@/lib/services/selects";

export const GET = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  const { userId } = await context.params;

  if (actor.id !== userId) {
    requireRole(actor, [Role.OWNER, Role.ADMIN]);
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: userSafeSelect,
  });

  return ok(user, requestId);
});

export const PATCH = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const { userId } = await context.params;
  const payload = userUpdateSchema.parse(await parseJson(request));

  if (actor.role === Role.ADMIN && payload.role && payload.role !== Role.EDITOR) {
    forbidden("Admin can only assign EDITOR role");
  }

  const encryptedPhone = payload.phone ? encryptField(payload.phone) : undefined;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: payload.displayName,
      fullName: payload.fullName,
      avatarUrl: payload.avatarUrl,
      role: payload.role,
      status: payload.status,
      country: payload.country,
      timezone: payload.timezone,
      declaredLevel: payload.declaredLevel,
      softwareStack: payload.softwareStack,
      availabilityText: payload.availabilityText,
      phoneEncrypted: encryptedPhone?.ciphertext,
      phoneKeyVersion: encryptedPhone?.keyVersion,
    },
    select: userSafeSelect,
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "users.update",
    entityType: "User",
    entityId: userId,
    metadataJson: { fields: Object.keys(payload) },
    ip,
    userAgent,
  });

  return ok(updated, requestId);
});
