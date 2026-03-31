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
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = submissionCreateSchema.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `submissions:create:${actor.id}:${payload.taskAssignmentId}:${ip ?? "unknown"}`,
    limit: 25,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    forbidden("Demasiados intentos de entrega. Intenta nuevamente en unos minutos.");
  }

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
  assertTaskTransitionAllowed(TaskState.UPLOADED, TaskState.IN_REVIEW);

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
          comment: "Pasa a edicion automaticamente antes de entregar",
        },
      });
    }

    const uploadFromState = requiresAutoStartEditing ? TaskState.IN_EDITING : assignment.task.state;

    await tx.task.update({
      where: { id: assignment.taskId },
      data: { state: TaskState.UPLOADED },
    });

    await tx.taskStatusHistory.create({
      data: {
        taskId: assignment.taskId,
        fromState: uploadFromState,
        toState: TaskState.UPLOADED,
        changedById: actor.id,
        comment: "Entrega subida",
      },
    });

    await tx.task.update({
      where: { id: assignment.taskId },
      data: { state: TaskState.IN_REVIEW },
    });

    await tx.taskStatusHistory.create({
      data: {
        taskId: assignment.taskId,
        fromState: TaskState.UPLOADED,
        toState: TaskState.IN_REVIEW,
        changedById: actor.id,
        comment: "Lista para revision",
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
    title: "Entrega para revision",
    message: `Hay una nueva entrega en la tarea ${assignment.task.title}.`,
    metadataJson: { taskId: assignment.task.id, submissionId: submission.id },
  });

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
