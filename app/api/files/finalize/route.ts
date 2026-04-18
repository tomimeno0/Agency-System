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

  if (!payload.taskId && !payload.assignmentId && !payload.campaignId) {
    badRequest("Debes indicar taskId, assignmentId o campaignId.");
  }

  if (payload.campaignId && payload.assignmentId) {
    badRequest("No puedes combinar campaignId con assignmentId.");
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

  if (payload.campaignId) {
    if (actor.role !== "OWNER") {
      forbidden("Solo owner puede finalizar brutos de campanas.");
    }
    await prisma.campaign.findUniqueOrThrow({
      where: { id: payload.campaignId },
      select: { id: true },
    });
  }

  if (payload.taskId && !payload.assignmentId) {
    const currentRawFiles = await prisma.taskFile.count({
      where: {
        taskId: payload.taskId,
        assignmentId: null,
      },
    });

    if (currentRawFiles >= env.UPLOAD_MAX_FILES_PER_TASK) {
      badRequest(
        `Se alcanzo el maximo de ${env.UPLOAD_MAX_FILES_PER_TASK} archivos brutos para esta tarea.`,
      );
    }
  }

  if (payload.campaignId && !payload.taskId && !payload.assignmentId) {
    const currentCampaignFiles = await prisma.taskFile.count({
      where: {
        campaignId: payload.campaignId,
        taskId: null,
        assignmentId: null,
      },
    });
    if (currentCampaignFiles >= env.UPLOAD_MAX_FILES_PER_CAMPAIGN) {
      badRequest(
        `Se alcanzo el maximo de ${env.UPLOAD_MAX_FILES_PER_CAMPAIGN} brutos para esta campana.`,
      );
    }
  }

  const previousFileWhere =
    payload.assignmentId
      ? { assignmentId: payload.assignmentId }
      : payload.taskId
        ? { taskId: payload.taskId, assignmentId: null }
        : payload.campaignId
          ? { campaignId: payload.campaignId, taskId: null, assignmentId: null }
          : null;

  const previousFile = previousFileWhere
    ? await prisma.taskFile.findFirst({
        where: previousFileWhere,
        orderBy: { version: "desc" },
        select: { version: true },
      })
    : null;

  const file = await prisma.taskFile.create({
    data: {
      taskId: payload.taskId,
      campaignId: payload.campaignId,
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

  if (payload.taskId && !payload.assignmentId) {
    await prisma.task.update({
      where: { id: payload.taskId },
      data: { rawAssetsReady: true },
    });
  }

  await appendAuditLog({
    actorUserId: actor.id,
    action: "files.finalized",
    entityType: "TaskFile",
    entityId: file.id,
    metadataJson: {
      taskId: payload.taskId,
      assignmentId: payload.assignmentId,
      campaignId: payload.campaignId,
      storageKey: payload.storageKey,
      version: file.version,
      scanStatus: "pending",
    },
    ip,
    userAgent,
  });

  return ok(file, requestId, 201);
});
