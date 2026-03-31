import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { assertAssignmentOwnershipAccess, assertTaskOwnershipAccess } from "@/lib/auth/policy";
import { finalizeFileSchema } from "@/lib/validation/schemas";
import { validateUpload } from "@/lib/storage/r2";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { env } from "@/lib/env";
import { checkRateLimitAdvanced } from "@/lib/security/rate-limit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = finalizeFileSchema.parse(await parseJson(request));
  const { ip, userAgent } = requestMeta(request);

  const rate = checkRateLimitAdvanced({
    key: `files:finalize:${actor.id}:${ip ?? "unknown"}`,
    limit: 60,
    windowMs: 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    forbidden("Demasiados intentos de finalizacion. Intenta nuevamente en unos minutos.");
  }

  if (!payload.taskId && !payload.assignmentId) {
    badRequest("Either taskId or assignmentId is required");
  }

  const normalizedMime = validateUpload(payload.mimeType, payload.sizeBytes, payload.originalName);

  if (payload.assignmentId) {
    const assignment = await prisma.taskAssignment.findUniqueOrThrow({
      where: { id: payload.assignmentId },
      select: { editorId: true, taskId: true },
    });

    if (payload.taskId && payload.taskId !== assignment.taskId) {
      badRequest("taskId does not match assignment.taskId");
    }

    if (actor.role === "EDITOR") {
      await assertAssignmentOwnershipAccess(actor, payload.assignmentId);
    }
  }

  if (payload.taskId && actor.role === "EDITOR") {
    await assertTaskOwnershipAccess(actor, payload.taskId);
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
      bucket: env.STORAGE_PROVIDER === "local" ? "local" : (env.R2_BUCKET ?? "r2"),
      originalName: payload.originalName,
      mimeType: normalizedMime,
      sizeBytes: payload.sizeBytes,
      isFinal: payload.isFinal,
      version: (previousFile?.version ?? 0) + 1,
    },
  });

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
      scanStatus: "pending",
    },
    ip,
    userAgent,
  });

  return ok(file, requestId, 201);
});
