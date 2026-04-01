import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { campaignUpdateSchema } from "@/lib/validation/schemas";
import { normalizeVideosPerCycle } from "@/lib/services/campaigns";

export const GET = defineRoute(async (_request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede ver campanas.");
  }

  const { campaignId } = await context.params;
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      client: {
        select: { id: true, name: true, brandName: true },
      },
      defaultEditor: {
        select: { id: true, displayName: true, status: true },
      },
      tasks: {
        select: {
          id: true,
          title: true,
          videoIndex: true,
          state: true,
          publishAt: true,
          deadlineAt: true,
          rawAssetsReady: true,
          directEditor: { select: { id: true, displayName: true } },
        },
        orderBy: [{ videoIndex: "asc" }, { createdAt: "asc" }],
      },
      financialMovements: {
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          occurredAt: true,
          description: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return ok(campaign, requestId);
});

export const PATCH = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede editar campanas.");
  }

  const { campaignId } = await context.params;
  const payload = campaignUpdateSchema.parse(await parseJson(request));
  const existing = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: {
      id: true,
      status: true,
      planPreset: true,
      videosPerCycle: true,
      pricePerVideo: true,
      leadDays: true,
      startDate: true,
      defaultEditorId: true,
      billingStatus: true,
    },
  });

  const nextPlanPreset = payload.planPreset ?? existing.planPreset;
  const nextVideosPerCycle = normalizeVideosPerCycle(
    nextPlanPreset,
    payload.videosPerCycle ?? existing.videosPerCycle,
  );

  const campaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      clientId: payload.clientId,
      name: payload.name,
      planPreset: payload.planPreset,
      videosPerCycle: nextVideosPerCycle,
      pricePerVideo: payload.pricePerVideo,
      leadDays: payload.leadDays,
      defaultEditorId:
        payload.defaultEditorId === null
          ? null
          : payload.defaultEditorId,
      status: payload.status,
      billingStatus: payload.billingStatus,
      startDate: payload.startDate ? new Date(payload.startDate) : undefined,
      currency: "ARS",
    },
  });

  const changedFields = Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field);

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "campaigns.update",
    entityType: "Campaign",
    entityId: campaignId,
    metadataJson: {
      changedFields,
      previousStatus: existing.status,
      previousBillingStatus: existing.billingStatus,
      previousVideosPerCycle: existing.videosPerCycle,
    },
    ip,
    userAgent,
  });

  return ok(campaign, requestId);
});
