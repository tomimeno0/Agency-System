import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { uploadUrlSchema } from "@/lib/validation/schemas";
import { buildStorageKey, createSignedUploadUrl, validateUpload } from "@/lib/storage/r2";
import { assertAssignmentOwnershipAccess, assertTaskOwnershipAccess } from "@/lib/auth/policy";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";
import { Role } from "@prisma/client";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = uploadUrlSchema.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `files:upload-url:${actor.id}:${ip ?? "unknown"}`,
    limit: 40,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    forbidden("Demasiados intentos de subida. Intenta nuevamente en unos minutos.");
  }

  if (!payload.taskId && !payload.assignmentId && !payload.campaignId) {
    badRequest("Debes indicar taskId, assignmentId o campaignId.");
  }

  if (payload.campaignId && payload.assignmentId) {
    badRequest("No puedes combinar campaignId con assignmentId.");
  }

  const normalizedMime = validateUpload(payload.mimeType, payload.sizeBytes, payload.fileName);

  if (payload.assignmentId && actor.role === Role.EDITOR) {
    await assertAssignmentOwnershipAccess(actor, payload.assignmentId);
  }

  if (payload.taskId && actor.role === Role.EDITOR) {
    await assertTaskOwnershipAccess(actor, payload.taskId);
  }

  if (payload.campaignId) {
    if (actor.role !== Role.OWNER) {
      forbidden("Solo owner puede subir brutos a campanas.");
    }
    await prisma.campaign.findUniqueOrThrow({
      where: { id: payload.campaignId },
      select: { id: true },
    });
  }

  const storageKey = buildStorageKey(payload.fileName);
  const uploadUrl = await createSignedUploadUrl({
    storageKey,
    mimeType: normalizedMime,
    expiresInSeconds: 300,
  });

  await appendAuditLog({
    actorUserId: actor.id,
    action: "files.upload_url_issued",
    entityType: "TaskFile",
    entityId: storageKey,
    metadataJson: {
      taskId: payload.taskId,
      assignmentId: payload.assignmentId,
      campaignId: payload.campaignId,
      mimeType: normalizedMime,
      sizeBytes: payload.sizeBytes,
    },
    ip,
    userAgent,
  });

  return ok(
    {
      storageKey,
      uploadUrl,
      mimeType: normalizedMime,
      expiresInSeconds: 300,
    },
    requestId,
  );
});
