import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { requireRole, requireSessionUser } from "@/lib/auth/session";
import { projectUpdateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const GET = defineRoute(async (_request, context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const { projectId } = await context.params;
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          brandName: true,
        },
      },
      tasks: {
        select: {
          id: true,
          title: true,
          state: true,
          deadlineAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  return ok(project, requestId);
});

export const PATCH = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const { projectId } = await context.params;
  const payload = projectUpdateSchema.parse(await parseJson(request));

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      title: payload.title,
      description: payload.description,
      packSize: payload.packSize,
      packPrice: payload.packPrice,
      currency: payload.currency,
      defaultStyleNotes: payload.defaultStyleNotes,
      active: payload.active,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "projects.update",
    entityType: "Project",
    entityId: projectId,
    metadataJson: { fields: Object.keys(payload) },
    ip,
    userAgent,
  });

  return ok(project, requestId);
});
