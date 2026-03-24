import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

type AppendAuditLogInput = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadataJson?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
};

export async function appendAuditLog(input: AppendAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadataJson: input.metadataJson,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export function requestMeta(request: NextRequest): { ip: string | null; userAgent: string | null } {
  const xff = request.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}
