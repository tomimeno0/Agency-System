import {
  AssignmentMode,
  AssignmentStatus,
  NotificationType,
  Prisma,
  Role,
  SystemAssignmentMode,
  TaskAssignmentFlowStatus,
  TaskState,
  UserStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { appendAuditLog } from "@/lib/services/audit";
import { createNotification } from "@/lib/services/notifications";

const OFFER_TIMEOUT_MINUTES = 30;
const OFFER_GROUP_SIZE = 3;
const MAX_AUTO_ATTEMPTS = 2;
const DEFAULT_SPLIT_CHUNK_SIZE = 10;

function offerExpiryDate(): Date {
  return new Date(Date.now() + OFFER_TIMEOUT_MINUTES * 60_000);
}

async function recalculateAcceptanceRate(tx: Prisma.TransactionClient, editorId: string) {
  const editor = await tx.user.findUniqueOrThrow({
    where: { id: editorId },
    select: {
      totalOffersCount: true,
      acceptedOffersCount: true,
    },
  });

  const acceptanceRate =
    editor.totalOffersCount > 0 ? editor.acceptedOffersCount / editor.totalOffersCount : 0;

  await tx.user.update({
    where: { id: editorId },
    data: { acceptanceRate },
  });
}

async function incrementOfferedCounters(tx: Prisma.TransactionClient, editorIds: string[]) {
  for (const editorId of editorIds) {
    await tx.user.update({
      where: { id: editorId },
      data: {
        totalOffersCount: { increment: 1 },
      },
    });
    await recalculateAcceptanceRate(tx, editorId);
  }
}

async function updateEditorAcceptanceMetrics(tx: Prisma.TransactionClient, editorId: string) {
  await tx.user.update({
    where: { id: editorId },
    data: {
      acceptedOffersCount: { increment: 1 },
      workloadScore: { increment: 1 },
    },
  });

  await recalculateAcceptanceRate(tx, editorId);
}

export async function getSystemConfig() {
  return prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      assignmentMode: SystemAssignmentMode.AUTOMATIC,
      darkModeEnabled: true,
    },
  });
}

export async function pickTopEditors(excludedEditorIds: string[], take = OFFER_GROUP_SIZE) {
  return prisma.user.findMany({
    where: {
      role: Role.EDITOR,
      status: UserStatus.ACTIVE,
      id: excludedEditorIds.length > 0 ? { notIn: excludedEditorIds } : undefined,
    },
    orderBy: [
      { workloadScore: "asc" },
      { acceptanceRate: "desc" },
      { acceptedOffersCount: "desc" },
      { createdAt: "asc" },
    ],
    take,
    select: {
      id: true,
      displayName: true,
    },
  });
}

export async function markExpiredOffers(taskId?: string) {
  const now = new Date();
  const pendingOffers = await prisma.taskAssignment.findMany({
    where: {
      status: AssignmentStatus.ASSIGNED,
      offerExpiresAt: { lt: now },
      ...(taskId ? { taskId } : {}),
    },
    select: {
      id: true,
      taskId: true,
    },
  });

  if (pendingOffers.length === 0) {
    return [] as string[];
  }

  const expiredIds = pendingOffers.map((item) => item.id);
  await prisma.taskAssignment.updateMany({
    where: { id: { in: expiredIds } },
    data: {
      status: AssignmentStatus.EXPIRED,
      rejectedAt: now,
      rejectionReason: "Offer timeout",
      autoCancelledAt: now,
    },
  });

  return [...new Set(pendingOffers.map((item) => item.taskId))];
}

async function createOfferRound(taskId: string, round: number, editorIds: string[], actorUserId: string | null) {
  const expiry = offerExpiryDate();

  await prisma.$transaction(async (tx) => {
    await tx.taskAssignment.createMany({
      data: editorIds.map((editorId) => ({
        taskId,
        editorId,
        status: AssignmentStatus.ASSIGNED,
        offerRound: round,
        offerExpiresAt: expiry,
      })),
    });

    await tx.task.update({
      where: { id: taskId },
      data: {
        assignmentFlowStatus: TaskAssignmentFlowStatus.PENDING_OFFER,
        state: TaskState.PENDING_ASSIGNMENT,
        assignmentAttempt: round,
        offerExpiresAt: expiry,
        offeredEditorIds: { push: editorIds },
      },
    });

    await incrementOfferedCounters(tx, editorIds);
  });

  for (const editorId of editorIds) {
    await createNotification({
      userId: editorId,
      type: NotificationType.NEW_TASK,
      title: "Nueva tarea ofrecida",
      message: "Tenes una oferta de tarea pendiente de respuesta.",
      metadataJson: { taskId, round, expiresAt: expiry.toISOString() },
    });
  }

  if (actorUserId) {
    await appendAuditLog({
      actorUserId,
      action: "tasks.auto_offer_round_created",
      entityType: "Task",
      entityId: taskId,
      metadataJson: {
        round,
        editorIds,
        expiresAt: expiry.toISOString(),
      },
    });
  }
}

export async function startAutomaticAssignment(taskId: string, actorUserId: string | null) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      id: true,
      assignmentAttempt: true,
      offeredEditorIds: true,
      assignmentMode: true,
    },
  });

  if (task.assignmentMode !== AssignmentMode.AUTOMATIC) {
    return;
  }

  const nextRound = task.assignmentAttempt + 1;
  const editors = await pickTopEditors(task.offeredEditorIds, OFFER_GROUP_SIZE);

  if (editors.length === 0) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        assignmentFlowStatus: TaskAssignmentFlowStatus.REJECTED,
        offerExpiresAt: null,
      },
    });
    return;
  }

  await createOfferRound(taskId, nextRound, editors.map((item) => item.id), actorUserId);
}

async function splitTaskAndReassign(taskId: string, actorUserId: string | null) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      clientId: true,
      directEditorId: true,
      title: true,
      description: true,
      instructions: true,
      deadlineAt: true,
      priority: true,
      estimatedDurationMinutes: true,
      createdById: true,
      totalVideos: true,
      splitChunkSize: true,
    },
  });

  const totalVideos = task.totalVideos ?? 0;
  const chunkSize = task.splitChunkSize ?? DEFAULT_SPLIT_CHUNK_SIZE;

  if (totalVideos <= 0 || totalVideos <= chunkSize) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        assignmentFlowStatus: TaskAssignmentFlowStatus.REJECTED,
        offerExpiresAt: null,
      },
    });
    return;
  }

  const chunkCount = Math.ceil(totalVideos / chunkSize);
  const createdTaskIds: string[] = [];

  for (let index = 0; index < chunkCount; index += 1) {
    const chunkVideos = index === chunkCount - 1 ? totalVideos - chunkSize * index : chunkSize;

    const child = await prisma.task.create({
      data: {
        projectId: task.projectId,
        clientId: task.clientId,
        directEditorId: task.directEditorId,
        title: `${task.title} (Chunk ${index + 1}/${chunkCount})`,
        description: task.description,
        instructions: task.instructions,
        deadlineAt: task.deadlineAt,
        priority: task.priority,
        estimatedDurationMinutes: task.estimatedDurationMinutes,
        state: TaskState.PENDING_ASSIGNMENT,
        assignedMode: "automatic",
        assignmentMode: AssignmentMode.AUTOMATIC,
        assignmentFlowStatus: TaskAssignmentFlowStatus.PENDING_OFFER,
        parentTaskId: task.id,
        totalVideos: chunkVideos,
        splitChunkSize: chunkSize,
        createdById: task.createdById,
      },
    });

    createdTaskIds.push(child.id);
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      assignmentFlowStatus: TaskAssignmentFlowStatus.DIVIDED,
      offerExpiresAt: null,
      state: TaskState.PENDING_ASSIGNMENT,
    },
  });

  for (const childTaskId of createdTaskIds) {
    await startAutomaticAssignment(childTaskId, actorUserId);
  }

  if (actorUserId) {
    await appendAuditLog({
      actorUserId,
      action: "tasks.auto_assignment_divided",
      entityType: "Task",
      entityId: task.id,
      metadataJson: {
        chunkCount,
        chunkSize,
        childTaskIds: createdTaskIds,
      },
    });
  }
}

export async function continueAssignmentFlow(taskId: string, actorUserId: string | null) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      assignments: true,
    },
  });

  const hasAccepted = task.assignments.some((item) => item.status === AssignmentStatus.ACCEPTED);
  if (hasAccepted) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        assignmentFlowStatus: TaskAssignmentFlowStatus.ACCEPTED,
        offerExpiresAt: null,
        state: TaskState.ACCEPTED,
      },
    });
    return;
  }

  const hasPendingOffers = task.assignments.some((item) => item.status === AssignmentStatus.ASSIGNED);
  if (hasPendingOffers) {
    return;
  }

  if (task.assignmentAttempt < MAX_AUTO_ATTEMPTS) {
    await startAutomaticAssignment(task.id, actorUserId);
    return;
  }

  await splitTaskAndReassign(task.id, actorUserId);
}

export async function acceptAssignment(assignmentId: string, actorUserId: string) {
  const assignment = await prisma.taskAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          createdById: true,
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

  await prisma.$transaction(async (tx) => {
    await tx.taskAssignment.update({
      where: { id: assignmentId },
      data: {
        status: AssignmentStatus.ACCEPTED,
        acceptedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
    });

    await tx.taskAssignment.updateMany({
      where: {
        taskId: assignment.taskId,
        id: { not: assignmentId },
        status: AssignmentStatus.ASSIGNED,
      },
      data: {
        status: AssignmentStatus.CANCELLED,
        autoCancelledAt: new Date(),
        rejectionReason: "Accepted by another editor",
      },
    });

    await tx.task.update({
      where: { id: assignment.taskId },
      data: {
        state: TaskState.ACCEPTED,
        assignmentFlowStatus: TaskAssignmentFlowStatus.ACCEPTED,
        offerExpiresAt: null,
      },
    });

    await updateEditorAcceptanceMetrics(tx, assignment.editorId);

    await tx.taskStatusHistory.create({
      data: {
        taskId: assignment.taskId,
        fromState: TaskState.PENDING_ASSIGNMENT,
        toState: TaskState.ACCEPTED,
        changedById: actorUserId,
        comment: "Assignment accepted",
      },
    });
  });

  await createNotification({
    userId: assignment.task.createdById,
    type: NotificationType.TASK_ACCEPTED,
    title: "Tarea aceptada",
    message: `${assignment.editor.displayName} acepto la tarea ${assignment.task.title}.`,
    metadataJson: { taskId: assignment.taskId, assignmentId },
  });
}

export async function rejectAssignment(assignmentId: string, actorUserId: string, reason?: string) {
  const assignment = await prisma.taskAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          createdById: true,
        },
      },
      editor: {
        select: {
          displayName: true,
        },
      },
    },
  });

  await prisma.taskAssignment.update({
    where: { id: assignmentId },
    data: {
      status: AssignmentStatus.REJECTED,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  });

  await createNotification({
    userId: assignment.task.createdById,
    type: NotificationType.SYSTEM,
    title: "Tarea rechazada",
    message: `${assignment.editor.displayName} rechazo la tarea ${assignment.task.title}.`,
    metadataJson: { taskId: assignment.taskId, assignmentId, reason },
  });

  await continueAssignmentFlow(assignment.taskId, actorUserId);
}
