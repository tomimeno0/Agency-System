import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { userUpdateSchema } from "@/lib/validation/schemas";
import { encryptField } from "@/lib/security/encryption";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { userSafeSelect } from "@/lib/services/selects";

export const GET = defineRoute(async (_request, _context, requestId) => {
  const actor = await requireSessionUser();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: userSafeSelect,
  });

  return ok(user, requestId);
});

export const PATCH = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = userUpdateSchema.parse(await parseJson(request));

  const encryptedPhone = payload.phone ? encryptField(payload.phone) : undefined;

  const user = await prisma.user.update({
    where: { id: actor.id },
    data: {
      displayName: payload.displayName,
      fullName: payload.fullName,
      avatarUrl: payload.avatarUrl,
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
    action: "users.update_self",
    entityType: "User",
    entityId: actor.id,
    metadataJson: { fields: Object.keys(payload) },
    ip,
    userAgent,
  });

  return ok(user, requestId);
});
