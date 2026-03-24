import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { forbidden } from "@/lib/http/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { learningResourceCreateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const GET = defineRoute(async (_request, _context, requestId) => {
  const actor = await requireSessionUser();

  const resources = await prisma.learningResource.findMany({
    where: actor.role === Role.OWNER ? undefined : { isActive: true },
    orderBy: [{ level: "asc" }, { createdAt: "desc" }],
    include: {
      progress: {
        where: { userId: actor.id },
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
          updatedAt: true,
        },
        take: 1,
      },
    },
  });

  return ok({ items: resources }, requestId);
});

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede publicar learning");
  }

  const payload = learningResourceCreateSchema.parse(await parseJson(request));
  const resource = await prisma.learningResource.create({
    data: {
      title: payload.title,
      description: payload.description,
      url: payload.url,
      level: payload.level,
      tags: payload.tags,
      isActive: payload.isActive,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "learning.resource_created",
    entityType: "LearningResource",
    entityId: resource.id,
    metadataJson: { level: resource.level, url: resource.url },
    ip,
    userAgent,
  });

  return ok(resource, requestId, 201);
});
