import { AssignmentStatus, Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { toHumanPriority, toHumanTaskState } from "@/lib/presentation/tasks";

type SearchParams = Promise<{
  month?: string;
}>;

function severity(deadlineAt: Date | null, now: Date): "critical" | "warning" | "normal" {
  if (!deadlineAt) return "normal";
  if (deadlineAt < now) return "critical";
  if (deadlineAt <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) return "warning";
  return "normal";
}

function toneClass(level: "critical" | "warning" | "normal") {
  if (level === "critical") return "border-red-800 bg-red-950/20 text-red-200";
  if (level === "warning") return "border-amber-800 bg-amber-950/20 text-amber-200";
  return "border-zinc-700 bg-zinc-900 text-zinc-200";
}

function parseMonth(input?: string): Date {
  if (!input) return new Date();
  const candidate = new Date(`${input}-01T00:00:00`);
  if (Number.isNaN(candidate.getTime())) return new Date();
  return candidate;
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const actor = session.user;
  const query = await searchParams;
  const parsedMonth = parseMonth(query.month);
  const monthStart = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth() + 1, 1, 0, 0, 0, 0);
  const now = new Date();

  const where =
    actor.role === Role.OWNER
      ? {
          OR: [
            { deadlineAt: { gte: monthStart, lt: monthEnd } },
            { publishAt: { gte: monthStart, lt: monthEnd } },
          ],
        }
      : {
          OR: [
            { directEditorId: actor.id },
            {
              assignments: {
                some: {
                  editorId: actor.id,
                  status: { in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED] },
                },
              },
            },
          ],
          AND: [
            {
              OR: [
                { deadlineAt: { gte: monthStart, lt: monthEnd } },
                { publishAt: { gte: monthStart, lt: monthEnd } },
              ],
            },
          ],
        };

  const tasks = await prisma.task.findMany({
    where,
    select: {
      id: true,
      title: true,
      videoIndex: true,
      state: true,
      priority: true,
      publishAt: true,
      deadlineAt: true,
      client: { select: { id: true, name: true, brandName: true } },
      campaign: { select: { id: true, name: true } },
      directEditor: { select: { id: true, displayName: true } },
      assignments: {
        select: { editor: { select: { id: true, displayName: true } } },
        take: 1,
      },
    },
    orderBy: [{ deadlineAt: "asc" }, { publishAt: "asc" }, { createdAt: "asc" }],
    take: 3000,
  });

  const rows = tasks.map((task) => {
    const clientName = task.client?.brandName ?? task.client?.name ?? "-";
    const editorName =
      task.directEditor?.displayName ??
      task.assignments[0]?.editor.displayName ??
      "Sin asignar";
    const relevantDate = task.deadlineAt ?? task.publishAt;
    const level = severity(relevantDate, now);
    return {
      taskId: task.id,
      title: task.title,
      campaignName: task.campaign?.name ?? "-",
      clientName,
      editorName,
      state: toHumanTaskState(task.state),
      priority: toHumanPriority(task.priority),
      publishAt: task.publishAt,
      deadlineAt: task.deadlineAt,
      level,
    };
  });

  rows.sort((a, b) => {
    const aDate = a.deadlineAt ?? a.publishAt ?? new Date(0);
    const bDate = b.deadlineAt ?? b.publishAt ?? new Date(0);
    return aDate.getTime() - bDate.getTime();
  });

  const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
  const previousMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1, 0, 0, 0, 0);
  const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1, 0, 0, 0, 0);
  const previousMonthKey = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

  return (
    <main className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-semibold">Calendario</h1>
          <p className="text-sm text-zinc-400">
            {actor.role === Role.OWNER
              ? "Vista global de campanas, deadlines y fechas de publicacion."
              : "Tus tareas con fecha de entrega y publicacion."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/calendar?month=${previousMonthKey}`} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
            Mes anterior
          </Link>
          <span className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm">{monthKey}</span>
          <Link href={`/dashboard/calendar?month=${nextMonthKey}`} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
            Mes siguiente
          </Link>
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111827]">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-zinc-400">No hay eventos para este mes.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-4 py-3 font-medium">Publicacion</th>
                <th className="px-4 py-3 font-medium">Tarea</th>
                <th className="px-4 py-3 font-medium">Campana</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Editor</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Prioridad</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.taskId} className={`border-b border-zinc-800 ${toneClass(row.level)}`}>
                  <td className="px-4 py-3">{row.deadlineAt ? row.deadlineAt.toLocaleString("es-AR") : "-"}</td>
                  <td className="px-4 py-3">{row.publishAt ? row.publishAt.toLocaleString("es-AR") : "-"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/tasks/${row.taskId}`} className="underline hover:text-white">
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{row.campaignName}</td>
                  <td className="px-4 py-3">{row.clientName}</td>
                  <td className="px-4 py-3">{row.editorName}</td>
                  <td className="px-4 py-3">{row.state}</td>
                  <td className="px-4 py-3">{row.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
