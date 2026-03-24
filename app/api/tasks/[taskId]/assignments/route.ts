import { AssignmentMode, AssignmentStatus, NotificationType, Role, TaskAssignmentFlowStatus, TaskState } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, forbidden, notFound } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { assignmentCreateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { createNotification } from "@/lib/services/notifications";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role === Role.EDITOR) {
    forbidden("Editor cannot assign tasks");
  }

  const { taskId } = await context.params;
  const payload = assignmentCreateSchema.parse(await parseJson(request));

  const editor = await prisma.user.findUnique({
    where: { id: payload.editorId },
    select: { id: true, role: true, displayName: true },
  });

  if (!editor || editor.role !== Role.EDITOR) {
    notFound("Editor user not found");
  }

  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) {
      notFound("Task not found");
    }

    const acceptedAssignment = await tx.taskAssignment.findFirst({
      where: {
        taskId,
        status: AssignmentStatus.ACCEPTED,
      },
    });

    if (acceptedAssignment) {
      conflict("Task already accepted by another editor");
    }

    await tx.taskAssignment.updateMany({
      where: {
        taskId,
        status: AssignmentStatus.ASSIGNED,
      },
      data: {
        status: AssignmentStatus.CANCELLED,
        autoCancelledAt: new Date(),
        rejectionReason: "Manual assignment override",
      },
    });

    const assignment = await tx.taskAssignment.create({
      data: {
        taskId,
        editorId: editor.id,
        percentageOfTask: payload.percentageOfTask,
        status: AssignmentStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });

    await tx.task.update({
      where: { id: taskId },
      data: {
        assignmentMode: AssignmentMode.MANUAL,
        assignmentFlowStatus: TaskAssignmentFlowStatus.ACCEPTED,
        state: TaskState.ACCEPTED,
        offerExpiresAt: null,
      },
    });

    await tx.taskStatusHistory.create({
      data: {
        taskId,
        fromState: task.state,
        toState: TaskState.ACCEPTED,
        changedById: actor.id,
        comment: "Manual assignment accepted",
      },
    });

    await tx.user.update({
      where: { id: editor.id },
      data: {
        workloadScore: { increment: 1 },
      },
    });

    return assignment;
  });

  await createNotification({
    userId: editor.id,
    type: NotificationType.NEW_TASK,
    title: "Tarea asignada manualmente",
    message: "Se te asigno una tarea de forma manual.",
    metadataJson: { taskId, assignmentId: result.id },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.manual_assignment_created",
    entityType: "TaskAssignment",
    entityId: result.id,
    metadataJson: {
      taskId,
      editorId: editor.id,
      percentageOfTask: payload.percentageOfTask,
    },
    ip,
    userAgent,
  });

  return ok(result, requestId, 201);
});
