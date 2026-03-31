import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { badRequest, forbidden } from "@/lib/http/errors";
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

  if (!payload.taskId && !payload.assignmentId) {
    badRequest("Either taskId or assignmentId is required");
  }

  const normalizedMime = validateUpload(payload.mimeType, payload.sizeBytes, payload.fileName);

  if (payload.assignmentId && actor.role === Role.EDITOR) {
    await assertAssignmentOwnershipAccess(actor, payload.assignmentId);
  }

  if (payload.taskId && actor.role === Role.EDITOR) {
    await assertTaskOwnershipAccess(actor, payload.taskId);
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
