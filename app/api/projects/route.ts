import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { requireRole, requireSessionUser } from "@/lib/auth/session";
import { projectCreateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { getPagination } from "@/lib/http/query";
import { env } from "@/lib/env";

export const GET = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const { take, skip } = getPagination(request);
  const projects = await prisma.project.findMany({
    include: {
      client: {
        select: {
          id: true,
          name: true,
          brandName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });

  return ok({ items: projects, take, skip }, requestId);
});

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const payload = projectCreateSchema.parse(await parseJson(request));

  const project = await prisma.project.create({
    data: {
      clientId: payload.clientId,
      title: payload.title,
      description: payload.description,
      packSize: payload.packSize,
      packPrice: payload.packPrice,
      currency: payload.currency ?? env.DEFAULT_CURRENCY,
      defaultStyleNotes: payload.defaultStyleNotes,
      active: payload.active,
      createdById: actor.id,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "projects.create",
    entityType: "Project",
    entityId: project.id,
    metadataJson: {
      clientId: project.clientId,
      packSize: project.packSize,
      packPrice: project.packPrice.toString(),
    },
    ip,
    userAgent,
  });

  return ok(project, requestId, 201);
});
