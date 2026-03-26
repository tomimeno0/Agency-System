import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { taskUpdateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

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
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (actor.role === Role.EDITOR && !task.assignments.some((assignment) => assignment.editorId === actor.id)) {
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

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      title: payload.title,
      projectId: payload.projectId,
      clientId: payload.clientId,
      directEditorId: payload.directEditorId,
      description: payload.description,
      instructions: payload.instructions,
      deadlineAt: payload.deadlineAt ? new Date(payload.deadlineAt) : undefined,
      priority: payload.priority,
      estimatedDurationMinutes: payload.estimatedDurationMinutes,
      assignedMode: payload.assignedMode,
      assignmentMode: payload.assignmentMode,
      totalVideos: payload.totalVideos,
      splitChunkSize: payload.splitChunkSize,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.update",
    entityType: "Task",
    entityId: taskId,
    metadataJson: { fields: Object.keys(payload) },
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
