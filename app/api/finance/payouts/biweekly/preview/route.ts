import { PaymentStatus, Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { biweeklyPayoutPreviewSchema } from "@/lib/validation/schemas";
import { resolveBiweeklyRange } from "@/lib/services/campaigns";
import { requestMeta } from "@/lib/services/audit";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede previsualizar liquidaciones quincenales.");
  }

  const payload = biweeklyPayoutPreviewSchema.parse(await parseJson(request));
  const { ip } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `finance:payouts:preview:${actor.id}:${ip ?? "unknown"}`,
    limit: 40,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    forbidden("Demasiados intentos de previsualizacion. Intenta nuevamente en unos minutos.");
  }

  const range = resolveBiweeklyRange({
    year: payload.year,
    month: payload.month,
    half: payload.half,
  });

  const items = await prisma.editorEarning.findMany({
    where: {
      status: PaymentStatus.APPROVED,
      paidAt: null,
      approvedAt: {
        gte: range.start,
        lt: range.end,
      },
    },
    include: {
      editor: { select: { id: true, displayName: true, email: true } },
      taskAssignment: {
        select: {
          id: true,
          task: {
            select: {
              id: true,
              title: true,
              client: { select: { id: true, name: true, brandName: true } },
            },
          },
        },
      },
    },
    orderBy: { approvedAt: "asc" },
    take: 3000,
  });

  const total = items.reduce((sum, item) => sum + Number(item.editorNetAmount), 0);

  return ok(
    {
      range,
      totals: {
        count: items.length,
        totalEditorNet: total,
        currency: "ARS",
      },
      items,
    },
    requestId,
  );
});
