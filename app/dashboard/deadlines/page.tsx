import { AssignmentStatus, Role, TaskPriority, TaskState } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { toHumanPriority, toHumanTaskStage } from "@/lib/presentation/tasks";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pick(value: string | string[] | undefined): string {
  if (!value) return "todos";
  return Array.isArray(value) ? value[0] ?? "todos" : value;
}

function rowTone(deadlineAt: Date | null, now: Date): string {
  if (!deadlineAt) return "border-b border-zinc-800";
  if (deadlineAt < now) return "border-b border-red-900/70 bg-red-950/20";
  if (deadlineAt <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
    return "border-b border-amber-900/70 bg-amber-950/20";
  }
  return "border-b border-zinc-800";
}

function urgency(deadlineAt: Date | null, now: Date): number {
  if (!deadlineAt) return 4;
  if (deadlineAt < now) return 0;
  if (deadlineAt <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) return 1;
  if (deadlineAt <= new Date(now.getTime() + 48 * 60 * 60 * 1000)) return 2;
  return 3;
}

export default async function DeadlinesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role === Role.EDITOR) redirect("/dashboard/tasks");

  const query = await searchParams;
  const filtro = pick(query.filtro);
  const prioridad = pick(query.prioridad);
  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDay = new Date(startDay.getTime() + 24 * 60 * 60 * 1000);
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const tasks = await prisma.task.findMany({
    where: {
      state: {
        notIn: [TaskState.APPROVED, TaskState.DELIVERED, TaskState.CLOSED, TaskState.CANCELLED],
      },
    },
    include: {
      client: { select: { id: true, name: true, brandName: true } },
      directEditor: { select: { id: true, displayName: true } },
      assignments: {
        select: {
          status: true,
          editor: { select: { id: true, displayName: true } },
        },
      },
    },
    orderBy: [{ deadlineAt: "asc" }, { createdAt: "desc" }],
    take: 600,
  });

  const filtered = tasks
    .filter((task) => {
      if (prioridad === "alta") return task.priority === TaskPriority.HIGH || task.priority === TaskPriority.URGENT;
      if (prioridad === "media") return task.priority === TaskPriority.MEDIUM;
      if (prioridad === "baja") return task.priority === TaskPriority.LOW;
      return true;
    })
    .filter((task) => {
      const hasEditor =
        Boolean(task.directEditorId) ||
        task.assignments.some(
          (assignment) =>
            assignment.status === AssignmentStatus.ASSIGNED ||
            assignment.status === AssignmentStatus.ACCEPTED,
        );
      if (filtro === "sin_editor") return !hasEditor;
      if (!task.deadlineAt) return filtro === "todos";
      if (filtro === "vencidas") return task.deadlineAt < now;
      if (filtro === "hoy") return task.deadlineAt >= startDay && task.deadlineAt < endDay;
      if (filtro === "24h") return task.deadlineAt >= now && task.deadlineAt <= next24h;
      if (filtro === "48h") return task.deadlineAt >= now && task.deadlineAt <= next48h;
      return true;
    })
    .sort((a, b) => {
      const rankDiff = urgency(a.deadlineAt, now) - urgency(b.deadlineAt, now);
      if (rankDiff !== 0) return rankDiff;
      if (!a.deadlineAt && !b.deadlineAt) return 0;
      if (!a.deadlineAt) return 1;
      if (!b.deadlineAt) return -1;
      return a.deadlineAt.getTime() - b.deadlineAt.getTime();
    });

  return (
    <main>
      <header className="mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Deadlines</h1>
          <p className="text-sm text-zinc-400">Control de vencimientos por urgencia</p>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[
          { key: "todos", label: "Todos" },
          { key: "vencidas", label: "Vencidas" },
          { key: "hoy", label: "Hoy" },
          { key: "24h", label: "Proximas 24h" },
          { key: "48h", label: "Proximas 48h" },
          { key: "sin_editor", label: "Sin editor" },
        ].map((item) => (
          <Link
            key={item.key}
            href={`/dashboard/deadlines?filtro=${item.key}&prioridad=${prioridad}`}
            className={`rounded-md border px-3 py-1.5 ${
              filtro === item.key
                ? "border-white bg-white text-black"
                : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[
          { key: "todos", label: "Prioridad: todas" },
          { key: "alta", label: "Alta" },
          { key: "media", label: "Media" },
          { key: "baja", label: "Baja" },
        ].map((item) => (
          <Link
            key={item.key}
            href={`/dashboard/deadlines?filtro=${filtro}&prioridad=${item.key}`}
            className={`rounded-md border px-3 py-1.5 ${
              prioridad === item.key
                ? "border-white bg-white text-black"
                : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111827]">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No hay tareas para este filtro.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Tarea</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Editor</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Prioridad</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => {
                const accepted = task.assignments.find((assignment) => assignment.status === AssignmentStatus.ACCEPTED);
                const assigned = task.assignments.find((assignment) => assignment.status === AssignmentStatus.ASSIGNED);
                const editorName =
                  accepted?.editor.displayName ??
                  assigned?.editor.displayName ??
                  task.directEditor?.displayName ??
                  "Sin asignar";
                const stage = toHumanTaskStage({
                  state: task.state,
                  assignmentFlowStatus: task.assignmentFlowStatus,
                  hasEditor: editorName !== "Sin asignar",
                });

                return (
                  <tr key={task.id} className={rowTone(task.deadlineAt, now)}>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/tasks/${task.id}`} className="underline hover:text-white">
                        {task.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{task.client?.brandName ?? task.client?.name ?? "-"}</td>
                    <td className="px-4 py-3">{editorName}</td>
                    <td className="px-4 py-3">
                      {task.deadlineAt ? task.deadlineAt.toLocaleString("es-AR") : "Sin deadline"}
                    </td>
                    <td className="px-4 py-3">{stage}</td>
                    <td className="px-4 py-3">{toHumanPriority(task.priority)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
