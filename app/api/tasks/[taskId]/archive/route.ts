import { AssignmentStatus, Role, TaskState } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden, notFound } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

function resolveArchivedState(current: TaskState): TaskState {
  if (current === TaskState.CLOSED || current === TaskState.CANCELLED) return current;
  if (current === TaskState.APPROVED || current === TaskState.DELIVERED) return TaskState.CLOSED;
  return TaskState.CANCELLED;
}

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role === Role.EDITOR) {
    forbidden("Editor cannot archive tasks");
  }

  const { taskId } = await context.params;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, state: true },
  });
  if (!task) {
    notFound("Task not found");
  }

  const toState = resolveArchivedState(task.state);

  await prisma.$transaction(async (tx) => {
    if (task.state !== toState) {
      await tx.task.update({
        where: { id: taskId },
        data: { state: toState },
      });

      await tx.taskStatusHistory.create({
        data: {
          taskId,
          fromState: task.state,
          toState,
          changedById: actor.id,
          comment: "Archivada desde panel de tareas",
        },
      });
    }

    await tx.taskAssignment.updateMany({
      where: {
        taskId,
        status: {
          in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED],
        },
      },
      data: {
        status: AssignmentStatus.CANCELLED,
      },
    });
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.archive",
    entityType: "Task",
    entityId: taskId,
    metadataJson: {
      from: task.state,
      to: toState,
    },
    ip,
    userAgent,
  });

  return ok({ archived: true, taskId, toState }, requestId);
});
