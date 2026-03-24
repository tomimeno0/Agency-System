import { Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { getPagination } from "@/lib/http/query";

export const GET = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede acceder a finanzas");
  }

  const { take, skip } = getPagination(request);
  const where = {};

  const earnings = await prisma.editorEarning.findMany({
    where,
    include: {
      editor: {
        select: {
          id: true,
          displayName: true,
        },
      },
      taskAssignment: {
        select: {
          id: true,
          taskId: true,
          percentageOfTask: true,
        },
      },
    },
    orderBy: { calculatedAt: "desc" },
    take,
    skip,
  });

  return ok({ items: earnings, take, skip }, requestId);
});
