import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { uploadUrlSchema } from "@/lib/validation/schemas";
import { buildStorageKey, createSignedUploadUrl, validateUpload } from "@/lib/storage/r2";
import { prisma } from "@/lib/db";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = uploadUrlSchema.parse(await parseJson(request));

  if (!payload.taskId && !payload.assignmentId) {
    badRequest("Either taskId or assignmentId is required");
  }

  validateUpload(payload.mimeType, payload.sizeBytes);

  if (payload.assignmentId) {
    const assignment = await prisma.taskAssignment.findUniqueOrThrow({
      where: { id: payload.assignmentId },
      select: { editorId: true },
    });

    if (actor.role === Role.EDITOR && assignment.editorId !== actor.id) {
      forbidden("Editor can only upload files for own assignments");
    }
  }

  if (payload.taskId && actor.role === Role.EDITOR) {
    const hasTaskAccess = await prisma.taskAssignment.findFirst({
      where: {
        taskId: payload.taskId,
        editorId: actor.id,
      },
      select: { id: true },
    });

    if (!hasTaskAccess) {
      forbidden("Editor can only upload files for own tasks");
    }
  }

  const storageKey = buildStorageKey(payload.fileName);
  const uploadUrl = await createSignedUploadUrl({
    storageKey,
    mimeType: payload.mimeType,
    expiresInSeconds: 300,
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "files.upload_url_issued",
    entityType: "TaskFile",
    entityId: storageKey,
    metadataJson: {
      taskId: payload.taskId,
      assignmentId: payload.assignmentId,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
    },
    ip,
    userAgent,
  });

  return ok(
    {
      storageKey,
      uploadUrl,
      expiresInSeconds: 300,
    },
    requestId,
  );
});
