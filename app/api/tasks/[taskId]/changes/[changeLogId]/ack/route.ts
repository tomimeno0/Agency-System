import { NotificationType, Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { createNotification } from "@/lib/services/notifications";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.EDITOR) {
    forbidden("Solo editores pueden confirmar cambios");
  }

  const { taskId, changeLogId } = await context.params;
  const changeLog = await prisma.taskChangeLog.findUniqueOrThrow({
    where: { id: changeLogId },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          createdById: true,
          directEditorId: true,
          assignments: {
            select: {
              editorId: true,
            },
          },
        },
      },
    },
  });

  if (changeLog.taskId !== taskId) {
    forbidden("Cambio no corresponde a esta tarea");
  }

  const canAck =
    changeLog.task.directEditorId === actor.id ||
    changeLog.task.assignments.some((assignment) => assignment.editorId === actor.id);
  if (!canAck) {
    forbidden("No puedes confirmar cambios de esta tarea");
  }

  const ack = await prisma.taskChangeAck.upsert({
    where: {
      changeLogId_editorId: {
        changeLogId,
        editorId: actor.id,
      },
    },
    update: {
      acknowledgedAt: new Date(),
    },
    create: {
      changeLogId,
      editorId: actor.id,
    },
  });

  await createNotification({
    userId: changeLog.task.createdById,
    type: NotificationType.SYSTEM,
    title: "Cambio confirmado por editor",
    message: `${actor.name ?? actor.email ?? "Editor"} confirmo los cambios de la tarea "${changeLog.task.title}".`,
    metadataJson: {
      taskId,
      changeLogId,
      editorId: actor.id,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "tasks.change_acknowledged",
    entityType: "TaskChangeLog",
    entityId: changeLogId,
    metadataJson: {
      taskId,
      editorId: actor.id,
    },
    ip,
    userAgent,
  });

  return ok(ack, requestId);
});
