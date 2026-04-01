import { CampaignStatus, Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { campaignCreateSchema } from "@/lib/validation/schemas";
import { normalizeVideosPerCycle } from "@/lib/services/campaigns";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";

export const GET = defineRoute(async (_request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede ver campanas.");
  }

  const campaigns = await prisma.campaign.findMany({
    include: {
      client: {
        select: { id: true, name: true, brandName: true },
      },
      defaultEditor: {
        select: { id: true, displayName: true, status: true },
      },
      _count: {
        select: {
          tasks: true,
          financialMovements: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 500,
  });

  return ok({ items: campaigns }, requestId);
});

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede crear campanas.");
  }

  const payload = campaignCreateSchema.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);
  const rate = checkRateLimitAdvanced({
    key: `campaigns:create:${actor.id}:${ip ?? "unknown"}`,
    limit: 40,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    forbidden("Demasiados intentos de crear campana.");
  }

  const videosPerCycle = normalizeVideosPerCycle(payload.planPreset, payload.videosPerCycle);
  const campaign = await prisma.campaign.create({
    data: {
      clientId: payload.clientId,
      name: payload.name,
      planPreset: payload.planPreset,
      videosPerCycle,
      pricePerVideo: payload.pricePerVideo,
      currency: "ARS",
      startDate: new Date(payload.startDate),
      leadDays: payload.leadDays,
      defaultEditorId: payload.defaultEditorId,
      status: CampaignStatus.DRAFT,
      createdById: actor.id,
    },
  });

  await appendAuditLog({
    actorUserId: actor.id,
    action: "campaigns.create",
    entityType: "Campaign",
    entityId: campaign.id,
    metadataJson: {
      clientId: campaign.clientId,
      videosPerCycle: campaign.videosPerCycle,
      pricePerVideo: campaign.pricePerVideo.toString(),
      defaultEditorId: campaign.defaultEditorId,
    },
    ip,
    userAgent,
  });

  return ok(campaign, requestId, 201);
});
