import { PaymentStatus, Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { dispatchSecurityAlert } from "@/lib/services/security-alerts";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede enviar finanzas a aprobacion");
  }

  const { earningId } = await context.params;

  const earning = await prisma.editorEarning.findUniqueOrThrow({ where: { id: earningId } });
  if (earning.status !== PaymentStatus.CALCULATED) {
    conflict("Only CALCULATED earnings can be submitted for approval");
  }

  const updated = await prisma.editorEarning.update({
    where: { id: earningId },
    data: {
      status: PaymentStatus.PENDING_OWNER_APPROVAL,
      submittedForApprovalAt: new Date(),
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "finance.earning_submitted_for_approval",
    entityType: "EditorEarning",
    entityId: earningId,
    metadataJson: {
      previousStatus: earning.status,
    },
    ip,
    userAgent,
  });

  await dispatchSecurityAlert({
    title: "Liquidacion enviada a aprobacion",
    message: `Se envio a aprobacion la liquidacion (${earningId}).`,
    metadataJson: {
      actorUserId: actor.id,
      earningId,
      previousStatus: earning.status,
      nextStatus: updated.status,
    },
  });

  return ok(updated, requestId);
});
