import { Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";

export const GET = defineRoute(async (_request, context, requestId) => {
  const actor = await requireSessionUser();
  const { earningId } = await context.params;

  const earning = await prisma.editorEarning.findUniqueOrThrow({
    where: { id: earningId },
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
      approvedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  if (actor.role === Role.EDITOR && earning.editorId !== actor.id) {
    forbidden("Editor can only access own earnings");
  }

  return ok(earning, requestId);
});
