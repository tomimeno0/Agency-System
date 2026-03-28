import { AssignmentMode, AssignmentStatus, Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { taskCreateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { getPagination } from "@/lib/http/query";
import {
  continueAssignmentFlow,
  getSystemConfig,
  markExpiredOffers,
  startAutomaticAssignment,
} from "@/lib/services/assignment-engine";

export const GET = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const expiredTaskIds = await markExpiredOffers();
  for (const expiredTaskId of expiredTaskIds) {
    await continueAssignmentFlow(expiredTaskId, actor.id);
  }

  const { take, skip } = getPagination(request);

  if (actor.role === Role.EDITOR) {
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          {
            assignments: {
              some: {
                editorId: actor.id,
                status: {
                  in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED],
                },
              },
            },
          },
          {
            directEditorId: actor.id,
          },
        ],
      },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            currency: true,
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
        },
      },
      assignments: {
        select: {
          id: true,
          editorId: true,
          editor: {
            select: {
              id: true,
              displayName: true,
            },
          },
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
    forbidden("Solo owner/admin pueden crear tasks");
  }

  const payload = taskCreateSchema.parse(await parseJson(request));
  const systemConfig = await getSystemConfig();
  const assignmentMode =
    payload.assignmentMode ??
    (systemConfig.assignmentMode === "AUTOMATIC"
      ? AssignmentMode.AUTOMATIC
      : AssignmentMode.MANUAL);
  const requestedState = payload.state;

  let nextState = requestedState;
  if (requestedState === "DRAFT" && !payload.directEditorId) {
    nextState = "PENDING_ASSIGNMENT";
  }
  if (requestedState === "DRAFT" && payload.directEditorId) {
    nextState = "OFFERED";
  }
  if (assignmentMode === AssignmentMode.AUTOMATIC && requestedState === "DRAFT") {
    nextState = "PENDING_ASSIGNMENT";
  }

  const task = await prisma.$transaction(async (tx) => {
    const createdTask = await tx.task.create({
      data: {
        projectId: payload.projectId,
        clientId: payload.clientId,
        directEditorId: payload.directEditorId,
        title: payload.title,
        description: payload.description,
        instructions: payload.instructions,
        deadlineAt: payload.deadlineAt ? new Date(payload.deadlineAt) : null,
        priority: payload.priority,
        estimatedDurationMinutes: payload.estimatedDurationMinutes,
        assignedMode: payload.assignedMode,
        state: nextState,
        assignmentMode,
        assignmentFlowStatus: "PENDING_OFFER",
        totalVideos: payload.totalVideos,
        splitChunkSize: payload.splitChunkSize,
        createdById: actor.id,
      },
    });

    await tx.taskStatusHistory.create({
      data: {
        taskId: createdTask.id,
        fromState: null,
        toState: createdTask.state,
        changedById: actor.id,
        comment: "Task creada",
      },
    });

    return createdTask;
  });

  if (payload.directEditorId && assignmentMode === AssignmentMode.MANUAL) {
    await prisma.taskAssignment.create({
      data: {
        taskId: task.id,
        editorId: payload.directEditorId,
        percentageOfTask: 100,
      },
    });
  }

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.create",
    entityType: "Task",
    entityId: task.id,
    metadataJson: {
      projectId: task.projectId,
      clientId: task.clientId,
      directEditorId: task.directEditorId,
      state: task.state,
      priority: task.priority,
      assignmentMode,
    },
    ip,
    userAgent,
  });

  if (assignmentMode === AssignmentMode.AUTOMATIC) {
    await startAutomaticAssignment(task.id, actor.id);
  }

  return ok(task, requestId, 201);
});
