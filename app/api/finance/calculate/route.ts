import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { financeCalculateSchema } from "@/lib/validation/schemas";
import { calculateEarningForAssignment } from "@/lib/services/finance";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede calcular finanzas");
  }

  const payload = financeCalculateSchema.parse(await parseJson(request));
  const earning = await calculateEarningForAssignment(payload);

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "finance.earning_calculated",
    entityType: "EditorEarning",
    entityId: earning.id,
    metadataJson: {
      taskAssignmentId: payload.taskAssignmentId,
      editorPercentage: payload.editorPercentage,
      agencyPercentage: payload.agencyPercentage,
    },
    ip,
    userAgent,
  });

  return ok(earning, requestId, 201);
});
