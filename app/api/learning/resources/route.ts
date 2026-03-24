import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";

export const GET = defineRoute(async (_request, _context, requestId) => {
  const actor = await requireSessionUser();

  const resources = await prisma.learningResource.findMany({
    where: { isActive: true },
    orderBy: [{ level: "asc" }, { createdAt: "desc" }],
    include: {
      progress: {
        where: { userId: actor.id },
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
          updatedAt: true,
        },
        take: 1,
      },
    },
  });

  return ok(resources, requestId);
});
