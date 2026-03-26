import { Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { workerNoteCreateSchema } from "@/lib/validation/schemas";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const GET = defineRoute(async (_request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
    forbidden("Solo owner/admin pueden ver notas internas");
  }

  const { workerId } = await context.params;
  const notes = await prisma.workerNote.findMany({
    where: { workerId },
    include: {
      author: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return ok({ items: notes }, requestId);
});

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
    forbidden("Solo owner/admin pueden crear notas internas");
  }

  const { workerId } = await context.params;
  const payload = workerNoteCreateSchema.parse(await parseJson(request));
  const note = await prisma.workerNote.create({
    data: {
      workerId,
      authorId: actor.id,
      content: payload.content,
    },
    include: {
      author: { select: { id: true, displayName: true } },
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "workers.note_created",
    entityType: "WorkerNote",
    entityId: note.id,
    metadataJson: { workerId },
    ip,
    userAgent,
  });

  return ok(note, requestId, 201);
});
