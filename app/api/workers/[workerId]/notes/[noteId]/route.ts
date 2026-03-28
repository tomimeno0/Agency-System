import { Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const DELETE = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
    forbidden("Solo owner/admin pueden eliminar notas internas");
  }

  const { workerId, noteId } = await context.params;

  const note = await prisma.workerNote.findUniqueOrThrow({
    where: { id: noteId },
    select: { id: true, workerId: true },
  });

  if (note.workerId !== workerId) {
    forbidden("La nota no pertenece al worker indicado");
  }

  await prisma.workerNote.delete({ where: { id: noteId } });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "workers.note_deleted",
    entityType: "WorkerNote",
    entityId: noteId,
    metadataJson: { workerId },
    ip,
    userAgent,
  });

  return ok({ deleted: true, noteId }, requestId);
});
