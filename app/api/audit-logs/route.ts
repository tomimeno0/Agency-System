import { Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { requireRole, requireSessionUser } from "@/lib/auth/session";
import { getPagination } from "@/lib/http/query";

export const GET = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER]);

  const { take, skip } = getPagination(request);

  const logs = await prisma.auditLog.findMany({
    include: {
      actor: {
        select: {
          id: true,
          displayName: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });

  return ok({ items: logs, take, skip }, requestId);
});
