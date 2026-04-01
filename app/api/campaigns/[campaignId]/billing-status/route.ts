import { CampaignBillingStatus, FinancialMovementStatus, Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { campaignBillingStatusSchemaInput } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";

export const PATCH = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede cambiar estado de cobro.");
  }

  const { campaignId } = await context.params;
  const payload = campaignBillingStatusSchemaInput.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `campaigns:billing:${actor.id}:${campaignId}:${ip ?? "unknown"}`,
    limit: 30,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    forbidden("Demasiados intentos de cambio de cobro. Intenta nuevamente en unos minutos.");
  }

  const existing = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { id: true, billingStatus: true },
  });

  const campaign = await prisma.$transaction(async (tx) => {
    await tx.financialMovement.updateMany({
      where: {
        campaignId,
        type: "INCOME",
      },
      data: {
        status:
          payload.billingStatus === CampaignBillingStatus.COLLECTED
            ? FinancialMovementStatus.CONFIRMED
            : payload.billingStatus === CampaignBillingStatus.CANCELLED
              ? FinancialMovementStatus.CANCELLED
              : FinancialMovementStatus.PENDING,
      },
    });

    return tx.campaign.update({
      where: { id: campaignId },
      data: { billingStatus: payload.billingStatus },
    });
  });

  await appendAuditLog({
    actorUserId: actor.id,
    action: "campaigns.billing_status_changed",
    entityType: "Campaign",
    entityId: campaignId,
    metadataJson: {
      from: existing.billingStatus,
      to: payload.billingStatus,
    },
    ip,
    userAgent,
  });

  return ok(campaign, requestId);
});
