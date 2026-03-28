import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { financialMovementUpdateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const PATCH = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede editar movimientos");
  }

  const { movementId } = await context.params;
  const payload = financialMovementUpdateSchema.parse(await parseJson(request));
  const updated = await prisma.financialMovement.update({
    where: { id: movementId },
    data: {
      type: payload.type,
      status: payload.status,
      subtype: payload.subtype,
      amount: payload.amount,
      occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : undefined,
      description: payload.description,
      method: payload.method,
      notes: payload.notes,
      clientId: payload.clientId,
      taskId: payload.taskId,
      editorId: payload.editorId,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "finance.movement_updated",
    entityType: "FinancialMovement",
    entityId: movementId,
    metadataJson: { fields: Object.keys(payload) },
    ip,
    userAgent,
  });
  return ok(updated, requestId);
});

export const DELETE = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede eliminar movimientos");
  }

  const { movementId } = await context.params;
  await prisma.financialMovement.delete({ where: { id: movementId } });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "finance.movement_deleted",
    entityType: "FinancialMovement",
    entityId: movementId,
    metadataJson: {},
    ip,
    userAgent,
  });

  return ok({ id: movementId, deleted: true }, requestId);
});
