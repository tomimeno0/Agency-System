import { Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const DELETE = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede eliminar material de learning");
  }

  const { resourceId } = await context.params;

  await prisma.$transaction(async (tx) => {
    await tx.learningProgress.deleteMany({
      where: { resourceId },
    });

    await tx.learningResource.delete({
      where: { id: resourceId },
    });
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "learning.resource_deleted",
    entityType: "LearningResource",
    entityId: resourceId,
    metadataJson: {},
    ip,
    userAgent,
  });

  return ok({ deleted: true, resourceId }, requestId);
});
