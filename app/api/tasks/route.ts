import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { taskCreateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { getPagination } from "@/lib/http/query";

export const GET = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const { take, skip } = getPagination(request);

  if (actor.role === Role.EDITOR) {
    const tasks = await prisma.task.findMany({
      where: {
        assignments: {
          some: {
            editorId: actor.id,
          },
        },
      },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            currency: true,
          },
        },
        assignments: {
          where: { editorId: actor.id },
          select: {
            id: true,
            status: true,
            assignedAt: true,
            acceptedAt: true,
            rejectedAt: true,
            percentageOfTask: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });

    return ok({ items: tasks, take, skip }, requestId);
  }

  const tasks = await prisma.task.findMany({
    include: {
      project: {
        select: {
          id: true,
          title: true,
          clientId: true,
          currency: true,
        },
      },
      assignments: {
        select: {
          id: true,
          editorId: true,
          status: true,
          percentageOfTask: true,
          assignedAt: true,
          acceptedAt: true,
          rejectedAt: true,
          completedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });

  return ok({ items: tasks, take, skip }, requestId);
});

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role === Role.EDITOR) {
    forbidden("Editor cannot create tasks");
  }

  const payload = taskCreateSchema.parse(await parseJson(request));

  const task = await prisma.$transaction(async (tx) => {
    const createdTask = await tx.task.create({
      data: {
        projectId: payload.projectId,
        title: payload.title,
        description: payload.description,
        instructions: payload.instructions,
        deadlineAt: payload.deadlineAt ? new Date(payload.deadlineAt) : null,
        priority: payload.priority,
        estimatedDurationMinutes: payload.estimatedDurationMinutes,
        assignedMode: payload.assignedMode,
        state: payload.state,
        createdById: actor.id,
      },
    });

    await tx.taskStatusHistory.create({
      data: {
        taskId: createdTask.id,
        fromState: null,
        toState: createdTask.state,
        changedById: actor.id,
        comment: "Task created",
      },
    });

    return createdTask;
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.create",
    entityType: "Task",
    entityId: task.id,
    metadataJson: {
      projectId: task.projectId,
      state: task.state,
      priority: task.priority,
    },
    ip,
    userAgent,
  });

  return ok(task, requestId, 201);
});
