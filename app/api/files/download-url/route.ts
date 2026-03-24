import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { downloadUrlSchema } from "@/lib/validation/schemas";
import { createSignedDownloadUrl } from "@/lib/storage/r2";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = downloadUrlSchema.parse(await parseJson(request));

  const file = await prisma.taskFile.findUniqueOrThrow({
    where: { id: payload.fileId },
    include: {
      assignment: {
        select: {
          editorId: true,
        },
      },
      task: {
        select: {
          id: true,
        },
      },
    },
  });

  if (actor.role === Role.EDITOR) {
    const ownByAssignment = file.assignment?.editorId === actor.id;

    if (!ownByAssignment) {
      const ownByTask = await prisma.taskAssignment.findFirst({
        where: {
          taskId: file.taskId ?? undefined,
          editorId: actor.id,
        },
        select: { id: true },
      });

      if (!ownByTask) {
        forbidden("Editor can only download own task files");
      }
    }
  }

  const downloadUrl = await createSignedDownloadUrl({
    storageKey: file.storageKey,
    expiresInSeconds: 300,
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "files.download_url_issued",
    entityType: "TaskFile",
    entityId: file.id,
    metadataJson: {
      storageKey: file.storageKey,
    },
    ip,
    userAgent,
  });

  return ok(
    {
      fileId: file.id,
      downloadUrl,
      expiresInSeconds: 300,
    },
    requestId,
  );
});
