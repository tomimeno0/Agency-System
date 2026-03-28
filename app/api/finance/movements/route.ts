import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { financialMovementCreateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { getPagination } from "@/lib/http/query";

export const GET = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede acceder a finanzas");
  }

  const { take, skip } = getPagination(request);
  const movements = await prisma.financialMovement.findMany({
    include: {
      client: { select: { id: true, name: true, brandName: true } },
      task: { select: { id: true, title: true } },
      editor: { select: { id: true, displayName: true } },
      createdBy: { select: { id: true, displayName: true } },
    },
    orderBy: { occurredAt: "desc" },
    take,
    skip,
  });

  return ok({ items: movements, take, skip }, requestId);
});

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede registrar movimientos");
  }

  const payload = financialMovementCreateSchema.parse(await parseJson(request));
  const movement = await prisma.financialMovement.create({
    data: {
      type: payload.type,
      status: payload.status,
      subtype: payload.subtype,
      amount: payload.amount,
      occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
      description: payload.description,
      method: payload.method,
      notes: payload.notes,
      clientId: payload.clientId,
      taskId: payload.taskId,
      editorId: payload.editorId,
      createdById: actor.id,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "finance.movement_created",
    entityType: "FinancialMovement",
    entityId: movement.id,
    metadataJson: { type: movement.type, amount: movement.amount.toString() },
    ip,
    userAgent,
  });

  return ok(movement, requestId, 201);
});
