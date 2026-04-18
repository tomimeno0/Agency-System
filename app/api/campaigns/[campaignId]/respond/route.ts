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
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.EDITOR) {
    forbidden("Solo editores pueden responder campanas.");
  }

  const { campaignId } = await context.params;
  const payload = assignmentRespondSchema.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `campaigns:respond:${actor.id}:${campaignId}:${ip ?? "unknown"}`,
    limit: 20,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    forbidden("Demasiados intentos. Intenta nuevamente en unos minutos.");
  }

  const assignments = await prisma.taskAssignment.findMany({
    where: {
      editorId: actor.id,
      status: AssignmentStatus.ASSIGNED,
      task: {
        campaignId,
      },
    },
    select: {
      id: true,
      taskId: true,
    },
    orderBy: {
      assignedAt: "asc",
    },
  });

  if (assignments.length === 0) {
    conflict("No hay ofertas activas de esta campana para responder.");
  }

  let processed = 0;
  for (const assignment of assignments) {
    await markExpiredOffers(assignment.taskId);
    await continueAssignmentFlow(assignment.taskId, actor.id);

    const fresh = await prisma.taskAssignment.findUnique({
      where: { id: assignment.id },
      select: { id: true, status: true },
    });
    if (!fresh || fresh.status !== AssignmentStatus.ASSIGNED) {
      continue;
    }

    if (payload.decision === "accept") {
      await acceptAssignment(assignment.id, actor.id);
    } else {
      await rejectAssignment(assignment.id, actor.id, payload.reason);
    }
    processed += 1;
  }

  if (processed === 0) {
    conflict("Las ofertas ya no estaban activas al momento de responder.");
  }

  await appendAuditLog({
    actorUserId: actor.id,
    action: payload.decision === "accept" ? "campaigns.accepted_by_editor" : "campaigns.rejected_by_editor",
    entityType: "Campaign",
    entityId: campaignId,
    metadataJson: {
      processedAssignments: processed,
      decision: payload.decision,
    },
    ip,
    userAgent,
  });

  return ok(
    {
      campaignId,
      decision: payload.decision,
      processedAssignments: processed,
    },
    requestId,
  );
});

