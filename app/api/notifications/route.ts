import { NotificationStatus } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";
import { getPagination } from "@/lib/http/query";

export const GET = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const unreadOnly = request.nextUrl.searchParams.get("unreadOnly") === "true";
  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  const { take, skip } = getPagination(request);

  const notifications = await prisma.notification.findMany({
    where: {
      userId: actor.id,
      ...(unreadOnly ? { status: NotificationStatus.UNREAD } : {}),
      ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });

  return ok({ items: notifications, take, skip }, requestId);
});
