import { NotificationType, Role, TaskState } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { taskTransitionSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { assertTaskTransitionAllowed } from "@/lib/services/task-state";
import { createNotification } from "@/lib/services/notifications";

const editorAllowedTransitions = new Set<TaskState>([TaskState.IN_EDITING, TaskState.UPLOADED]);

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  const { taskId } = await context.params;
  const payload = taskTransitionSchema.parse(await parseJson(request));

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      assignments: {
        select: {
          editorId: true,
          status: true,
        },
      },
    },
  });

  if (actor.role === Role.EDITOR) {
    const isAssignedEditor = task.assignments.some((assignment) => assignment.editorId === actor.id);
    if (!isAssignedEditor || !editorAllowedTransitions.has(payload.toState)) {
      forbidden("Editor cannot perform this state transition");
    }
  }

  assertTaskTransitionAllowed(task.state, payload.toState);

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { state: payload.toState },
    }),
    prisma.taskStatusHistory.create({
      data: {
        taskId,
        fromState: task.state,
        toState: payload.toState,
        changedById: actor.id,
        comment: payload.comment,
      },
    }),
  ]);

  if (payload.toState === TaskState.NEEDS_CORRECTION) {
    for (const assignment of task.assignments) {
      await createNotification({
        userId: assignment.editorId,
        type: NotificationType.REVIEW_REQUIRED,
        title: "Corrección requerida",
        message: "La entrega recibió feedback y requiere una nueva versión.",
        metadataJson: { taskId },
      });
    }
  }

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.state_changed",
    entityType: "Task",
    entityId: taskId,
    metadataJson: {
      from: task.state,
      to: payload.toState,
      comment: payload.comment,
    },
    ip,
    userAgent,
  });

  return ok({ taskId, fromState: task.state, toState: payload.toState }, requestId);
});
