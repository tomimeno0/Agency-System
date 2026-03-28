import { AssignmentStatus, NotificationType, Role, TaskState } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { submissionCreateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { assertTaskTransitionAllowed } from "@/lib/services/task-state";
import { createNotification } from "@/lib/services/notifications";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = submissionCreateSchema.parse(await parseJson(request));

  const assignment = await prisma.taskAssignment.findUniqueOrThrow({
    where: { id: payload.taskAssignmentId },
    include: {
      task: {
        select: {
          id: true,
          state: true,
          createdById: true,
          title: true,
        },
      },
    },
  });

  if (actor.role === Role.EDITOR && assignment.editorId !== actor.id) {
    forbidden("Editor can only submit for own assignments");
  }

  const requiresAutoStartEditing = assignment.task.state === TaskState.ACCEPTED;
  if (requiresAutoStartEditing) {
    assertTaskTransitionAllowed(TaskState.ACCEPTED, TaskState.IN_EDITING);
    assertTaskTransitionAllowed(TaskState.IN_EDITING, TaskState.UPLOADED);
  } else {
    assertTaskTransitionAllowed(assignment.task.state, TaskState.UPLOADED);
  }

  const submission = await prisma.$transaction(async (tx) => {
    const created = await tx.submission.create({
      data: {
        taskAssignmentId: assignment.id,
        submittedById: actor.id,
        fileId: payload.fileId,
        notes: payload.notes,
      },
    });

    if (requiresAutoStartEditing) {
      await tx.task.update({
        where: { id: assignment.taskId },
        data: { state: TaskState.IN_EDITING },
      });

      await tx.taskStatusHistory.create({
        data: {
          taskId: assignment.taskId,
          fromState: TaskState.ACCEPTED,
          toState: TaskState.IN_EDITING,
          changedById: actor.id,
          comment: "Auto-start editing before submission",
        },
      });
    }

    await tx.task.update({
      where: { id: assignment.taskId },
      data: { state: TaskState.UPLOADED },
    });

    await tx.taskStatusHistory.create({
      data: {
        taskId: assignment.taskId,
        fromState: requiresAutoStartEditing ? TaskState.IN_EDITING : assignment.task.state,
        toState: TaskState.UPLOADED,
        changedById: actor.id,
        comment: "Submission uploaded",
      },
    });

    await tx.taskAssignment.update({
      where: { id: assignment.id },
      data: {
        status: AssignmentStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    return created;
  });

  await createNotification({
    userId: assignment.task.createdById,
    type: NotificationType.REVIEW_REQUIRED,
    title: "Entrega para revisión",
    message: `Hay una nueva entrega en la tarea ${assignment.task.title}.`,
    metadataJson: { taskId: assignment.task.id, submissionId: submission.id },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "submissions.create",
    entityType: "Submission",
    entityId: submission.id,
    metadataJson: {
      taskAssignmentId: payload.taskAssignmentId,
      fileId: payload.fileId,
    },
    ip,
    userAgent,
  });

  return ok(submission, requestId, 201);
});
