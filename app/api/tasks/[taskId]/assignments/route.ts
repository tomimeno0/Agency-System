import { AssignmentStatus, NotificationType, Role, TaskState } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, forbidden, notFound } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { assignmentCreateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { assertTaskTransitionAllowed } from "@/lib/services/task-state";
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

    const existingOpenAssignment = await tx.taskAssignment.findFirst({
      where: {
        taskId,
        editorId: editor.id,
        status: { in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED] },
      },
    });

    if (existingOpenAssignment) {
      conflict("Editor already has an active assignment for this task");
    }

    assertTaskTransitionAllowed(task.state, TaskState.OFFERED);

    const assignment = await tx.taskAssignment.create({
      data: {
        taskId,
        editorId: editor.id,
        percentageOfTask: payload.percentageOfTask,
        status: AssignmentStatus.ASSIGNED,
      },
    });

    await tx.task.update({
      where: { id: taskId },
      data: { state: TaskState.OFFERED },
    });

    await tx.taskStatusHistory.create({
      data: {
        taskId,
        fromState: task.state,
        toState: TaskState.OFFERED,
        changedById: actor.id,
        comment: "Task offered to editor",
      },
    });

    return assignment;
  });

  await createNotification({
    userId: editor.id,
    type: NotificationType.NEW_TASK,
    title: "Nueva tarea ofrecida",
    message: `Tenés una nueva tarea asignada para revisar y aceptar.`,
    metadataJson: { taskId, assignmentId: result.id },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.assignment_created",
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
