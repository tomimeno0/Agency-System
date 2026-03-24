import { LearningProgressStatus } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { learningProgressSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = learningProgressSchema.parse(await parseJson(request));

  const progress = await prisma.learningProgress.upsert({
    where: {
      userId_resourceId: {
        userId: actor.id,
        resourceId: payload.resourceId,
      },
    },
    create: {
      userId: actor.id,
      resourceId: payload.resourceId,
      status: payload.status,
      startedAt:
        payload.status === LearningProgressStatus.IN_PROGRESS ||
        payload.status === LearningProgressStatus.COMPLETED
          ? new Date()
          : null,
      completedAt: payload.status === LearningProgressStatus.COMPLETED ? new Date() : null,
    },
    update: {
      status: payload.status,
      startedAt:
        payload.status === LearningProgressStatus.IN_PROGRESS ||
        payload.status === LearningProgressStatus.COMPLETED
          ? new Date()
          : undefined,
      completedAt: payload.status === LearningProgressStatus.COMPLETED ? new Date() : null,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "learning.progress_updated",
    entityType: "LearningProgress",
    entityId: progress.id,
    metadataJson: {
      resourceId: payload.resourceId,
      status: payload.status,
    },
    ip,
    userAgent,
  });

  return ok(progress, requestId);
});
