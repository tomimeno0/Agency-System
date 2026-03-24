import { Role, UserStatus } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireRole, requireSessionUser } from "@/lib/auth/session";
import { z } from "zod";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

const statusSchema = z.object({
  status: z.nativeEnum(UserStatus),
});

export const PATCH = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const { userId } = await context.params;
  const payload = statusSchema.parse(await parseJson(request));
  const previous = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { status: true, role: true },
  });

  if (actor.role === Role.ADMIN && previous.role !== Role.EDITOR) {
    forbidden("Admin solo puede modificar estado de editores");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: payload.status },
    select: {
      id: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "users.status_changed",
    entityType: "User",
    entityId: userId,
    metadataJson: { status: payload.status },
    ip,
    userAgent,
  });

  if (previous.status === UserStatus.PENDING_APPROVAL && payload.status === UserStatus.ACTIVE) {
    await appendAuditLog({
      actorUserId: actor.id,
      action: "auth.register_approved",
      entityType: "User",
      entityId: userId,
      metadataJson: { from: previous.status, to: payload.status },
      ip,
      userAgent,
    });
  }

  if (previous.status === UserStatus.PENDING_APPROVAL && payload.status === UserStatus.INACTIVE) {
    await appendAuditLog({
      actorUserId: actor.id,
      action: "auth.register_rejected",
      entityType: "User",
      entityId: userId,
      metadataJson: { from: previous.status, to: payload.status },
      ip,
      userAgent,
    });
  }

  return ok(user, requestId);
});
