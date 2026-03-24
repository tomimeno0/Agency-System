import { PaymentStatus, Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Only owner can approve earnings");
  }

  const { earningId } = await context.params;
  const earning = await prisma.editorEarning.findUniqueOrThrow({ where: { id: earningId } });

  if (earning.status !== PaymentStatus.PENDING_OWNER_APPROVAL) {
    conflict("Only PENDING_OWNER_APPROVAL earnings can be approved");
  }

  const updated = await prisma.editorEarning.update({
    where: { id: earningId },
    data: {
      status: PaymentStatus.APPROVED,
      approvedAt: new Date(),
      approvedById: actor.id,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "finance.earning_approved",
    entityType: "EditorEarning",
    entityId: earningId,
    metadataJson: {
      previousStatus: earning.status,
    },
    ip,
    userAgent,
  });

  return ok(updated, requestId);
});
