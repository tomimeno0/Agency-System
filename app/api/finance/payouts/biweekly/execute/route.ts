import { PaymentStatus, Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { biweeklyPayoutExecuteSchema } from "@/lib/validation/schemas";
import { resolveBiweeklyRange } from "@/lib/services/campaigns";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede ejecutar liquidaciones quincenales.");
  }

  const payload = biweeklyPayoutExecuteSchema.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `finance:payouts:execute:${actor.id}:${ip ?? "unknown"}`,
    limit: 20,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    forbidden("Demasiados intentos de liquidacion. Intenta nuevamente en unos minutos.");
  }

  const range = resolveBiweeklyRange({
    year: payload.year,
    month: payload.month,
    half: payload.half,
  });

  const targetWhere =
    payload.earningIds && payload.earningIds.length > 0
      ? {
          id: { in: payload.earningIds },
          status: PaymentStatus.APPROVED,
          paidAt: null,
        }
      : {
          status: PaymentStatus.APPROVED,
          paidAt: null,
          approvedAt: {
            gte: range.start,
            lt: range.end,
          },
        };

  const targetItems = await prisma.editorEarning.findMany({
    where: targetWhere,
    select: {
      id: true,
      editorNetAmount: true,
      editorId: true,
    },
    take: 5000,
  });

  const ids = targetItems.map((item) => item.id);
  if (ids.length === 0) {
    return ok(
      {
        range,
        paidCount: 0,
        totalEditorNet: 0,
      },
      requestId,
    );
  }

  await prisma.editorEarning.updateMany({
    where: { id: { in: ids } },
    data: {
      status: PaymentStatus.PAID,
      paidAt: new Date(),
      notes: payload.notes ?? undefined,
    },
  });

  const total = targetItems.reduce((sum, item) => sum + Number(item.editorNetAmount), 0);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "finance.biweekly_payout_executed",
    entityType: "EditorEarning",
    entityId: null,
    metadataJson: {
      range,
      paidCount: ids.length,
      totalEditorNet: total,
      notes: payload.notes ?? null,
    },
    ip,
    userAgent,
  });

  return ok(
    {
      range,
      paidCount: ids.length,
      totalEditorNet: total,
      currency: "ARS",
    },
    requestId,
  );
});
