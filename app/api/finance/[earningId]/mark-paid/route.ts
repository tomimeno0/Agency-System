import { PaymentStatus, Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role === Role.EDITOR) {
    forbidden("Editor cannot mark earnings as paid");
  }

  const { earningId } = await context.params;
  const earning = await prisma.editorEarning.findUniqueOrThrow({ where: { id: earningId } });

  if (earning.status !== PaymentStatus.APPROVED) {
    conflict("Only APPROVED earnings can be marked as paid");
  }

  const updated = await prisma.editorEarning.update({
    where: { id: earningId },
    data: {
      status: PaymentStatus.PAID,
      paidAt: new Date(),
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "finance.earning_marked_paid",
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
