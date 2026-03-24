import { NotificationType, ReviewDecision, Role, TaskState } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { reviewCreateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { assertTaskTransitionAllowed } from "@/lib/services/task-state";
import { createNotification } from "@/lib/services/notifications";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role === Role.EDITOR) {
    forbidden("Editor cannot review submissions");
  }

  const { submissionId } = await context.params;
  const payload = reviewCreateSchema.parse(await parseJson(request));

  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: {
      reviews: true,
      taskAssignment: {
        include: {
          task: {
            select: {
              id: true,
              state: true,
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
      },
    },
  });

  if (submission.reviews.length > 0) {
    conflict("Submission already has a review");
  }

  const nextTaskState =
    payload.decision === ReviewDecision.APPROVED
      ? TaskState.APPROVED
      : TaskState.NEEDS_CORRECTION;

  assertTaskTransitionAllowed(submission.taskAssignment.task.state, nextTaskState);

  const review = await prisma.$transaction(async (tx) => {
    const createdReview = await tx.review.create({
      data: {
        submissionId,
        reviewedById: actor.id,
        decision: payload.decision,
        comments: payload.comments,
      },
    });

    await tx.task.update({
      where: { id: submission.taskAssignment.taskId },
      data: {
        state: nextTaskState,
      },
    });

    await tx.taskStatusHistory.create({
      data: {
        taskId: submission.taskAssignment.taskId,
        fromState: submission.taskAssignment.task.state,
        toState: nextTaskState,
        changedById: actor.id,
        comment:
          payload.decision === ReviewDecision.APPROVED
            ? "Submission approved"
            : "Submission requires correction",
      },
    });

    return createdReview;
  });

  await createNotification({
    userId: submission.taskAssignment.editor.id,
    type:
      payload.decision === ReviewDecision.APPROVED
        ? NotificationType.SYSTEM
        : NotificationType.REVIEW_REQUIRED,
    title:
      payload.decision === ReviewDecision.APPROVED
        ? "Entrega aprobada"
        : "Corrección requerida",
    message:
      payload.decision === ReviewDecision.APPROVED
        ? `Tu entrega para ${submission.taskAssignment.task.title} fue aprobada.`
        : `Tu entrega para ${submission.taskAssignment.task.title} requiere corrección.`,
    metadataJson: {
      submissionId,
      taskId: submission.taskAssignment.taskId,
      decision: payload.decision,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "submissions.reviewed",
    entityType: "Review",
    entityId: review.id,
    metadataJson: {
      submissionId,
      decision: payload.decision,
    },
    ip,
    userAgent,
  });

  return ok(review, requestId, 201);
});
