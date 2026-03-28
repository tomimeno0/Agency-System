import { AssignmentMode, AssignmentStatus, NotificationType, Role, TaskAssignmentFlowStatus, TaskState } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { taskUpdateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { createNotification } from "@/lib/services/notifications";

export const GET = defineRoute(async (_request, context, requestId) => {
  const actor = await requireSessionUser();
  const { taskId } = await context.params;

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          clientId: true,
        },
      },
      client: {
        select: {
          id: true,
          name: true,
          brandName: true,
        },
      },
      directEditor: {
        select: {
          id: true,
          displayName: true,
          role: true,
        },
      },
      assignments: {
        include: {
          editor: {
            select: {
              id: true,
              displayName: true,
              role: true,
            },
          },
        },
      },
      statusHistory: {
        orderBy: { changedAt: "desc" },
        take: 50,
      },
      files: {
        where: {
          assignmentId: null,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (
    actor.role === Role.EDITOR &&
    task.directEditorId !== actor.id &&
    !task.assignments.some(
      (assignment) =>
        assignment.editorId === actor.id &&
        (assignment.status === AssignmentStatus.ASSIGNED ||
          assignment.status === AssignmentStatus.ACCEPTED ||
          assignment.status === AssignmentStatus.COMPLETED),
    )
  ) {
    forbidden("Editors can only access their own tasks");
  }

  return ok(task, requestId);
});

export const PATCH = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role === Role.EDITOR) {
    forbidden("Editor cannot update task configuration");
  }

  const { taskId } = await context.params;
  const payload = taskUpdateSchema.parse(await parseJson(request));
  const hasDirectEditorField = Object.prototype.hasOwnProperty.call(payload, "directEditorId");

  const existing = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { id: true, state: true, directEditorId: true },
  });

  const nextDirectEditorId = hasDirectEditorField ? (payload.directEditorId ?? null) : undefined;
  const shouldAssignEditor =
    typeof nextDirectEditorId === "string" && nextDirectEditorId !== existing.directEditorId;
  const shouldUnassignEditor = nextDirectEditorId === null && existing.directEditorId !== null;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTask = await tx.task.update({
      where: { id: taskId },
      data: {
        title: payload.title,
        projectId: payload.projectId === null ? null : payload.projectId,
        clientId: payload.clientId === null ? null : payload.clientId,
        directEditorId: nextDirectEditorId,
        description: payload.description,
        instructions: payload.instructions,
        deadlineAt:
          payload.deadlineAt === null
            ? null
            : payload.deadlineAt
              ? new Date(payload.deadlineAt)
              : undefined,
        priority: payload.priority,
        estimatedDurationMinutes: payload.estimatedDurationMinutes,
        assignedMode: payload.assignedMode,
        assignmentMode: payload.assignmentMode,
        totalVideos: payload.totalVideos,
        splitChunkSize: payload.splitChunkSize,
      },
    });

    if (shouldAssignEditor && typeof nextDirectEditorId === "string") {
      await tx.taskAssignment.updateMany({
        where: {
          taskId,
          status: {
            in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED],
          },
          editorId: { not: nextDirectEditorId },
        },
        data: {
          status: AssignmentStatus.CANCELLED,
          autoCancelledAt: new Date(),
          rejectionReason: "Manual assignment override",
        },
      });

      const existingAccepted = await tx.taskAssignment.findFirst({
        where: {
          taskId,
          editorId: nextDirectEditorId,
          status: { in: [AssignmentStatus.ACCEPTED, AssignmentStatus.ASSIGNED] },
        },
        select: { id: true },
      });

      if (existingAccepted) {
        await tx.taskAssignment.update({
          where: { id: existingAccepted.id },
          data: {
            status: AssignmentStatus.ACCEPTED,
            acceptedAt: new Date(),
            rejectedAt: null,
            rejectionReason: null,
          },
        });
      } else {
        await tx.taskAssignment.create({
          data: {
            taskId,
            editorId: nextDirectEditorId,
            status: AssignmentStatus.ACCEPTED,
            acceptedAt: new Date(),
            percentageOfTask: 100,
          },
        });
      }

      await tx.task.update({
        where: { id: taskId },
        data: {
          assignmentMode: AssignmentMode.MANUAL,
          assignmentFlowStatus: TaskAssignmentFlowStatus.ACCEPTED,
          state: TaskState.IN_EDITING,
          offerExpiresAt: null,
        },
      });

      await tx.taskStatusHistory.create({
        data: {
          taskId,
          fromState: existing.state,
          toState: TaskState.IN_EDITING,
          changedById: actor.id,
          comment: "Manual assignment accepted from edit and moved to editing",
        },
      });
    }

    if (shouldUnassignEditor) {
      await tx.taskAssignment.updateMany({
        where: {
          taskId,
          status: {
            in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED],
          },
        },
        data: {
          status: AssignmentStatus.CANCELLED,
          autoCancelledAt: new Date(),
          rejectionReason: "Unassigned from edit",
        },
      });

      await tx.task.update({
        where: { id: taskId },
        data: {
          assignmentMode: AssignmentMode.MANUAL,
          assignmentFlowStatus: TaskAssignmentFlowStatus.PENDING_OFFER,
          state: TaskState.PENDING_ASSIGNMENT,
          offerExpiresAt: null,
        },
      });

      await tx.taskStatusHistory.create({
        data: {
          taskId,
          fromState: existing.state,
          toState: TaskState.PENDING_ASSIGNMENT,
          changedById: actor.id,
          comment: "Editor unassigned from edit",
        },
      });
    }

    return updatedTask;
  });

  if (shouldAssignEditor && typeof nextDirectEditorId === "string") {
    await createNotification({
      userId: nextDirectEditorId,
      type: NotificationType.NEW_TASK,
      title: "Tarea asignada",
      message: "Se te asigno una tarea desde edicion.",
      metadataJson: { taskId },
    });
  }

  const changedFields = Object.keys(payload);
  if (changedFields.length > 0) {
    const notifyEditors = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        title: true,
        directEditorId: true,
        assignments: {
          where: {
            status: {
              in: [
                AssignmentStatus.ASSIGNED,
                AssignmentStatus.ACCEPTED,
                AssignmentStatus.COMPLETED,
              ],
            },
          },
          select: { editorId: true },
        },
      },
    });

    if (notifyEditors) {
      const recipients = new Set<string>();
      if (notifyEditors.directEditorId) recipients.add(notifyEditors.directEditorId);
      for (const assignment of notifyEditors.assignments) {
        recipients.add(assignment.editorId);
      }

      for (const editorId of recipients) {
        await createNotification({
          userId: editorId,
          type: NotificationType.SYSTEM,
          title: "Tarea actualizada",
          message: `La tarea "${notifyEditors.title}" fue editada. Revisa cambios de instrucciones y deadline.`,
          metadataJson: {
            taskId,
            changedFields,
          },
        });
      }
    }
  }

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.update",
    entityType: "Task",
    entityId: taskId,
    metadataJson: { fields: changedFields },
    ip,
    userAgent,
  });

  return ok(updated, requestId);
});

export const DELETE = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Only owner can delete tasks");
  }

  const { taskId } = await context.params;

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true },
  });
  if (!existing) {
    return ok({ deleted: false, reason: "not_found" }, requestId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.deleteMany({
      where: {
        submission: {
          taskAssignment: {
            taskId,
          },
        },
      },
    });

    await tx.submission.deleteMany({
      where: {
        taskAssignment: {
          taskId,
        },
      },
    });

    await tx.editorEarning.deleteMany({
      where: {
        taskAssignment: {
          taskId,
        },
      },
    });

    await tx.taskAssignment.deleteMany({
      where: { taskId },
    });

    await tx.taskFile.updateMany({
      where: { taskId },
      data: { taskId: null },
    });

    await tx.financialMovement.updateMany({
      where: { taskId },
      data: { taskId: null },
    });

    await tx.task.delete({
      where: { id: taskId },
    });
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.delete",
    entityType: "Task",
    entityId: taskId,
    metadataJson: { hardDelete: true },
    ip,
    userAgent,
  });

  return ok({ deleted: true }, requestId);
});
