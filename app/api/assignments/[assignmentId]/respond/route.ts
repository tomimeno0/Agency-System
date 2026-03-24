import { AssignmentStatus, NotificationType, Role, TaskState } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { assignmentRespondSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { assertTaskTransitionAllowed } from "@/lib/services/task-state";
import { createNotification } from "@/lib/services/notifications";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  const { assignmentId } = await context.params;
  const payload = assignmentRespondSchema.parse(await parseJson(request));

  const assignment = await prisma.taskAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      task: {
        select: {
          id: true,
          state: true,
          createdById: true,
          title: true,
        },
      },
      editor: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  if (actor.role === Role.EDITOR && assignment.editorId !== actor.id) {
    forbidden("Editor can only respond to own assignments");
  }

  if (payload.decision === "accept") {
    assertTaskTransitionAllowed(assignment.task.state, TaskState.ACCEPTED);

    await prisma.$transaction([
      prisma.taskAssignment.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.ACCEPTED,
          acceptedAt: new Date(),
          rejectedAt: null,
          rejectionReason: null,
        },
      }),
      prisma.task.update({
        where: { id: assignment.taskId },
        data: {
          state: TaskState.ACCEPTED,
        },
      }),
      prisma.taskStatusHistory.create({
        data: {
          taskId: assignment.taskId,
          fromState: assignment.task.state,
          toState: TaskState.ACCEPTED,
          changedById: actor.id,
          comment: "Assignment accepted",
        },
      }),
    ]);

    await createNotification({
      userId: assignment.task.createdById,
      type: NotificationType.TASK_ACCEPTED,
      title: "Tarea aceptada",
      message: `${assignment.editor.displayName} aceptó la tarea ${assignment.task.title}.`,
      metadataJson: { taskId: assignment.taskId, assignmentId },
    });
  } else {
    assertTaskTransitionAllowed(assignment.task.state, TaskState.PENDING_ASSIGNMENT);

    await prisma.$transaction([
      prisma.taskAssignment.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: payload.reason,
        },
      }),
      prisma.task.update({
        where: { id: assignment.taskId },
        data: {
          state: TaskState.PENDING_ASSIGNMENT,
        },
      }),
      prisma.taskStatusHistory.create({
        data: {
          taskId: assignment.taskId,
          fromState: assignment.task.state,
          toState: TaskState.PENDING_ASSIGNMENT,
          changedById: actor.id,
          comment: "Assignment rejected",
        },
      }),
    ]);

    await createNotification({
      userId: assignment.task.createdById,
      type: NotificationType.SYSTEM,
      title: "Tarea rechazada",
      message: `${assignment.editor.displayName} rechazó la tarea ${assignment.task.title}.`,
      metadataJson: { taskId: assignment.taskId, assignmentId, reason: payload.reason },
    });
  }

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: payload.decision === "accept" ? "assignments.accepted" : "assignments.rejected",
    entityType: "TaskAssignment",
    entityId: assignmentId,
    metadataJson: {
      taskId: assignment.taskId,
      reason: payload.reason,
    },
    ip,
    userAgent,
  });

  return ok({ assignmentId, decision: payload.decision }, requestId);
});
