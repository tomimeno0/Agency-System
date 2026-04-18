import { AssignmentMode, AssignmentStatus, CampaignBillingStatus, CampaignStatus, FinancialMovementStatus, FinancialMovementType, Role, TaskAssignmentFlowStatus, TaskPriority, TaskState } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { campaignPublishSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { buildCampaignSchedule } from "@/lib/services/campaigns";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede publicar campanas.");
  }

  const { campaignId } = await context.params;
  const payload = campaignPublishSchema.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `campaigns:publish:${actor.id}:${campaignId}:${ip ?? "unknown"}`,
    limit: 20,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    conflict("Demasiados intentos de publicacion. Intenta nuevamente en unos minutos.");
  }

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      _count: { select: { tasks: true } },
    },
  });

  if (campaign.status === CampaignStatus.PUBLISHED && !payload.forceRepublish) {
    conflict("La campana ya fue publicada.");
  }

  if (campaign._count.tasks > 0 && !payload.forceRepublish) {
    conflict("La campana ya tiene tareas generadas. Usa forceRepublish para regenerar.");
  }

  const schedule = buildCampaignSchedule({
    startDate: campaign.startDate,
    videosPerCycle: campaign.videosPerCycle,
    leadDays: campaign.leadDays,
  });

  const taskPrefix = campaign.name.trim();
  const nextState = campaign.defaultEditorId ? TaskState.OFFERED : TaskState.PENDING_ASSIGNMENT;

  const created = await prisma.$transaction(async (tx) => {
    if (payload.forceRepublish && campaign._count.tasks > 0) {
      const campaignTaskIds = (
        await tx.task.findMany({
          where: { campaignId: campaign.id },
          select: { id: true },
        })
      ).map((item) => item.id);

      await tx.taskAssignment.deleteMany({
        where: {
          taskId: { in: campaignTaskIds },
        },
      });
      await tx.taskStatusHistory.deleteMany({
        where: {
          taskId: { in: campaignTaskIds },
        },
      });
      await tx.task.deleteMany({
        where: { id: { in: campaignTaskIds } },
      });
      await tx.taskFile.updateMany({
        where: {
          campaignId: campaign.id,
          taskId: { in: campaignTaskIds },
        },
        data: { taskId: null },
      });
    }

    const campaignRawFiles = await tx.taskFile.findMany({
      where: {
        campaignId: campaign.id,
        taskId: null,
        assignmentId: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    for (const item of schedule) {
      const rawFileForTask = campaignRawFiles[item.videoIndex - 1] ?? null;
      const task = await tx.task.create({
        data: {
          campaignId: campaign.id,
          clientId: campaign.clientId,
          directEditorId: campaign.defaultEditorId,
          videoIndex: item.videoIndex,
          title: `${taskPrefix} - Video ${String(item.videoIndex).padStart(2, "0")}/${campaign.videosPerCycle}`,
          description: `Entrega planificada ${item.videoIndex}/${campaign.videosPerCycle}`,
          deadlineAt: item.deadlineAt,
          publishAt: item.publishAt,
          priority: TaskPriorityFromLeadDays(campaign.leadDays),
          state: nextState,
          assignedMode: "manual",
          assignmentMode: AssignmentMode.MANUAL,
          assignmentFlowStatus: TaskAssignmentFlowStatus.PENDING_OFFER,
          totalVideos: campaign.videosPerCycle,
          splitChunkSize: 10,
          rawAssetsReady: Boolean(rawFileForTask),
          createdById: actor.id,
        },
      });

      if (rawFileForTask) {
        await tx.taskFile.update({
          where: { id: rawFileForTask.id },
          data: {
            taskId: task.id,
          },
        });
      }

      await tx.taskStatusHistory.create({
        data: {
          taskId: task.id,
          fromState: null,
          toState: nextState,
          changedById: actor.id,
          comment: "Task creada desde campana",
        },
      });

      if (campaign.defaultEditorId) {
        await tx.taskAssignment.create({
          data: {
            taskId: task.id,
            editorId: campaign.defaultEditorId,
            status: AssignmentStatus.ASSIGNED,
            percentageOfTask: 100,
          },
        });
      }
    }

    const movementAmount = Number(campaign.pricePerVideo) * campaign.videosPerCycle;
    const movement = await tx.financialMovement.create({
      data: {
        type: FinancialMovementType.INCOME,
        status: FinancialMovementStatus.PENDING,
        amount: movementAmount,
        description: `Campana publicada: ${campaign.name} (${campaign.videosPerCycle} videos)`,
        occurredAt: new Date(),
        currency: "ARS",
        clientId: campaign.clientId,
        campaignId: campaign.id,
        createdById: actor.id,
      },
    });

    const updatedCampaign = await tx.campaign.update({
      where: { id: campaign.id },
      data: {
        status: CampaignStatus.PUBLISHED,
        billingStatus:
          campaign.billingStatus === CampaignBillingStatus.CANCELLED
            ? CampaignBillingStatus.PENDING_COLLECTION
            : campaign.billingStatus,
        publishedAt: new Date(),
      },
    });

    return { updatedCampaign, movement };
  });

  await appendAuditLog({
    actorUserId: actor.id,
    action: "campaigns.publish",
    entityType: "Campaign",
    entityId: campaign.id,
    metadataJson: {
      tasksCreated: schedule.length,
      movementStatus: "PENDING",
      movementAmount: Number(campaign.pricePerVideo) * campaign.videosPerCycle,
      forceRepublish: payload.forceRepublish,
    },
    ip,
    userAgent,
  });

  return ok(
    {
      campaign: created.updatedCampaign,
      generatedTasks: schedule.length,
      movementId: created.movement.id,
    },
    requestId,
    201,
  );
});

function TaskPriorityFromLeadDays(leadDays: number): TaskPriority {
  if (leadDays < 0) return TaskPriority.HIGH;
  return TaskPriority.MEDIUM;
}
