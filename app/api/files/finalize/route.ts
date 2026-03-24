import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { finalizeFileSchema } from "@/lib/validation/schemas";
import { validateUpload } from "@/lib/storage/r2";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { env } from "@/lib/env";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = finalizeFileSchema.parse(await parseJson(request));

  if (!payload.taskId && !payload.assignmentId) {
    badRequest("Either taskId or assignmentId is required");
  }

  validateUpload(payload.mimeType, payload.sizeBytes);

  if (payload.assignmentId) {
    const assignment = await prisma.taskAssignment.findUniqueOrThrow({
      where: { id: payload.assignmentId },
      select: { editorId: true, taskId: true },
    });

    if (payload.taskId && payload.taskId !== assignment.taskId) {
      badRequest("taskId does not match assignment.taskId");
    }

    if (actor.role === Role.EDITOR && assignment.editorId !== actor.id) {
      forbidden("Editor can only finalize files for own assignments");
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
      forbidden("Editor can only finalize files for own tasks");
    }
  }

  const previousFile = await prisma.taskFile.findFirst({
    where: {
      taskId: payload.taskId,
      assignmentId: payload.assignmentId,
    },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const file = await prisma.taskFile.create({
    data: {
      taskId: payload.taskId,
      assignmentId: payload.assignmentId,
      uploadedById: actor.id,
      storageKey: payload.storageKey,
      bucket: env.R2_BUCKET,
      originalName: payload.originalName,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      isFinal: payload.isFinal,
      version: (previousFile?.version ?? 0) + 1,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "files.finalized",
    entityType: "TaskFile",
    entityId: file.id,
    metadataJson: {
      taskId: payload.taskId,
      assignmentId: payload.assignmentId,
      storageKey: payload.storageKey,
      version: file.version,
    },
    ip,
    userAgent,
  });

  return ok(file, requestId, 201);
});
