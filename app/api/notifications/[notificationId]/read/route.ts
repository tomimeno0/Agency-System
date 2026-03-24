import { NotificationStatus } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  const { notificationId } = await context.params;

  const notification = await prisma.notification.findUniqueOrThrow({
    where: { id: notificationId },
    select: {
      id: true,
      userId: true,
      status: true,
    },
  });

  if (notification.userId !== actor.id) {
    forbidden("Cannot modify another user's notification");
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: NotificationStatus.READ,
      readAt: new Date(),
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "notifications.mark_read",
    entityType: "Notification",
    entityId: notificationId,
    metadataJson: { previousStatus: notification.status },
    ip,
    userAgent,
  });

  return ok(updated, requestId);
});
