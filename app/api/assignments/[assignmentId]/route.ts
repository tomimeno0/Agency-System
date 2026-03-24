import { Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";

export const GET = defineRoute(async (_request, context, requestId) => {
  const actor = await requireSessionUser();
  const { assignmentId } = await context.params;

  const assignment = await prisma.taskAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          state: true,
          projectId: true,
        },
      },
      editor: {
        select: {
          id: true,
          displayName: true,
          role: true,
        },
      },
      submissions: {
        orderBy: { submittedAt: "desc" },
      },
      earnings: true,
    },
  });

  if (actor.role === Role.EDITOR && assignment.editorId !== actor.id) {
    forbidden("Editor can only access own assignments");
  }

  return ok(assignment, requestId);
});
