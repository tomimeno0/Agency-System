import { AssignmentStatus, Role } from "@prisma/client";
import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { forbidden } from "@/lib/http/errors";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/session";

function severity(deadlineAt: Date | null, now: Date): "critical" | "warning" | "normal" {
  if (!deadlineAt) return "normal";
  if (deadlineAt < now) return "critical";
  if (deadlineAt <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) return "warning";
  return "normal";
}

export const GET = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const month = request.nextUrl.searchParams.get("month");
  const scope = request.nextUrl.searchParams.get("scope") ?? "me";

  const baseDate = month ? new Date(`${month}-01T00:00:00.000Z`) : new Date();
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1, 0, 0, 0, 0);
  const now = new Date();

  if (scope === "owner" && actor.role !== Role.OWNER) {
    forbidden("Solo owner puede consultar calendario global.");
  }

  const where =
    actor.role === Role.OWNER && scope === "owner"
      ? {
          OR: [
            { deadlineAt: { gte: start, lt: end } },
            { publishAt: { gte: start, lt: end } },
          ],
        }
      : {
          OR: [
            {
              assignments: {
                some: {
                  editorId: actor.id,
                  status: {
                    in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED],
                  },
                },
              },
            },
            { directEditorId: actor.id },
          ],
          AND: [
            {
              OR: [
                { deadlineAt: { gte: start, lt: end } },
                { publishAt: { gte: start, lt: end } },
              ],
            },
          ],
        };

  const tasks = await prisma.task.findMany({
    where,
    select: {
      id: true,
      title: true,
      state: true,
      deadlineAt: true,
      publishAt: true,
      priority: true,
      client: {
        select: { id: true, name: true, brandName: true },
      },
      directEditor: {
        select: { id: true, displayName: true },
      },
      assignments: {
        select: {
          editor: { select: { id: true, displayName: true } },
          status: true,
        },
        take: 1,
      },
    },
    orderBy: [{ deadlineAt: "asc" }, { publishAt: "asc" }, { createdAt: "asc" }],
    take: 2000,
  });

  const events = tasks.flatMap((task) => {
    const editorName =
      task.directEditor?.displayName ??
      task.assignments[0]?.editor.displayName ??
      "Sin asignar";
    const clientName = task.client?.brandName ?? task.client?.name ?? "-";
    const base = {
      taskId: task.id,
      taskTitle: task.title,
      state: task.state,
      priority: task.priority,
      editorName,
      clientName,
    };
    const items: Array<Record<string, unknown>> = [];
    if (task.publishAt) {
      items.push({
        ...base,
        type: "publish",
        at: task.publishAt,
        severity: severity(task.deadlineAt, now),
      });
    }
    if (task.deadlineAt) {
      items.push({
        ...base,
        type: "deadline",
        at: task.deadlineAt,
        severity: severity(task.deadlineAt, now),
      });
    }
    return items;
  });

  return ok(
    {
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      scope: actor.role === Role.OWNER && scope === "owner" ? "owner" : "me",
      items: events,
    },
    requestId,
  );
});
