import { AssignmentStatus, Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  const { assignmentId } = await context.params;

  const assignment = await prisma.taskAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    select: {
      id: true,
      editorId: true,
      status: true,
      taskId: true,
    },
  });

  if (actor.role === Role.EDITOR && assignment.editorId !== actor.id) {
    forbidden("Editor can only complete own assignments");
  }

  const updated = await prisma.taskAssignment.update({
    where: { id: assignmentId },
    data: {
      status: AssignmentStatus.COMPLETED,
      completedAt: new Date(),
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "assignments.completed",
    entityType: "TaskAssignment",
    entityId: assignmentId,
    metadataJson: { previousStatus: assignment.status },
    ip,
    userAgent,
  });

  return ok(updated, requestId);
});
