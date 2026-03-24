import { Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";

export const GET = defineRoute(async (_request, context, requestId) => {
  const actor = await requireSessionUser();
  const { submissionId } = await context.params;

  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: {
      taskAssignment: {
        select: {
          id: true,
          editorId: true,
          taskId: true,
        },
      },
      file: true,
      reviews: {
        orderBy: { reviewedAt: "desc" },
      },
    },
  });

  if (actor.role === Role.EDITOR && submission.taskAssignment.editorId !== actor.id) {
    forbidden("Editor can only access own submissions");
  }

  return ok(submission, requestId);
});
