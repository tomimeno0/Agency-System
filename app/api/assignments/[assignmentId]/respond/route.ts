import { AssignmentStatus, Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict, forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { assignmentRespondSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import {
  acceptAssignment,
  continueAssignmentFlow,
  markExpiredOffers,
  rejectAssignment,
} from "@/lib/services/assignment-engine";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  const { assignmentId } = await context.params;
  const payload = assignmentRespondSchema.parse(await parseJson(request));

  const assignment = await prisma.taskAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      task: {
        select: {
          id: true,
          assignmentFlowStatus: true,
        },
      },
    },
  });

  if (actor.role === Role.EDITOR && assignment.editorId !== actor.id) {
    forbidden("Editor can only respond to own assignments");
  }

  await markExpiredOffers(assignment.taskId);
  await continueAssignmentFlow(assignment.taskId, actor.id);

  const freshAssignment = await prisma.taskAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      task: {
        select: {
          id: true,
          assignmentFlowStatus: true,
        },
      },
    },
  });

  if (freshAssignment.status !== AssignmentStatus.ASSIGNED) {
    conflict("This offer is no longer active");
  }

  if (payload.decision === "accept") {
    await acceptAssignment(assignmentId, actor.id);
  } else {
    await rejectAssignment(assignmentId, actor.id, payload.reason);
  }

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: payload.decision === "accept" ? "assignments.accepted" : "assignments.rejected",
    entityType: "TaskAssignment",
    entityId: assignmentId,
    metadataJson: {
      taskId: assignment.taskId,
      reason: payload.reason,
      flowStatus: freshAssignment.task.assignmentFlowStatus,
    },
    ip,
    userAgent,
  });

  return ok({ assignmentId, decision: payload.decision }, requestId);
});
