import { PaymentStatus, Role, TaskState } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { taskReopenSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede reabrir tareas aprobadas.");
  }

  const { taskId } = await context.params;
  const payload = taskReopenSchema.parse(await parseJson(request));

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      assignments: {
        select: {
          id: true,
          editorId: true,
          earnings: {
            select: {
              id: true,
              status: true,
              paidAt: true,
            },
            take: 1,
          },
        },
      },
    },
  });

  if (task.state !== TaskState.APPROVED) {
    conflict("Solo se puede reabrir una tarea en estado APROBADA.");
  }

  const paidEarning = task.assignments
    .flatMap((assignment) => assignment.earnings)
    .find((earning) => earning.status === PaymentStatus.PAID || earning.paidAt !== null);

  if (paidEarning && !payload.forceFinancialAdjustment) {
    conflict("La tarea ya tiene un pago marcado. Usa forceFinancialAdjustment para forzar ajuste.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        state: TaskState.NEEDS_CORRECTION,
      },
    });

    await tx.taskStatusHistory.create({
      data: {
        taskId,
        fromState: TaskState.APPROVED,
        toState: TaskState.NEEDS_CORRECTION,
        changedById: actor.id,
        comment: payload.reason,
      },
    });

    for (const assignment of task.assignments) {
      for (const earning of assignment.earnings) {
        await tx.editorEarning.update({
          where: { id: earning.id },
          data: {
            status: PaymentStatus.CANCELLED,
            notes: payload.reason,
          },
        });
      }
    }
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.reopened",
    entityType: "Task",
    entityId: taskId,
    metadataJson: {
      reason: payload.reason,
      forceFinancialAdjustment: payload.forceFinancialAdjustment,
      hadPaidEarning: Boolean(paidEarning),
    },
    ip,
    userAgent,
  });

  return ok({ taskId, state: TaskState.NEEDS_CORRECTION }, requestId);
});
