import { Role, TaskState } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { toHumanPriority, toHumanTaskStage } from "@/lib/presentation/tasks";

export default async function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role === Role.EDITOR) redirect("/dashboard");

  const { clientId } = await params;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      tasks: {
        include: {
          directEditor: { select: { id: true, displayName: true } },
          assignments: {
            include: {
              editor: { select: { id: true, displayName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!client) notFound();

  const activeTasks = client.tasks.filter(
    (task) =>
      task.state !== TaskState.APPROVED &&
      task.state !== TaskState.DELIVERED &&
      task.state !== TaskState.CLOSED &&
      task.state !== TaskState.CANCELLED,
  );
  const nextDeadlines = activeTasks
    .filter((task) => task.deadlineAt !== null)
    .sort((a, b) => (a.deadlineAt!.getTime() - b.deadlineAt!.getTime()))
    .slice(0, 8);

  return (
    <main>
      <div className="mb-4">
        <Link href="/dashboard/clients" className="text-sm text-zinc-300 underline hover:text-white">
          Volver a clientes
        </Link>
      </div>

      <header className="mb-4">
        <h1 className="text-2xl font-semibold">{client.brandName ?? client.name}</h1>
        <p className="text-sm text-zinc-400">
          {client.name} · {client.email ?? "Sin email"} · estado {client.status}
        </p>
      </header>

      <section className="mb-4 grid gap-3 rounded-xl border border-zinc-800 bg-[#111827] p-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-zinc-400">Tareas activas</p>
          <p className="text-2xl font-semibold">{activeTasks.length}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Total tareas</p>
          <p className="text-2xl font-semibold">{client.tasks.length}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Pagos registrados</p>
          <p className="text-2xl font-semibold">{client.payments.length}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Ultima actividad</p>
          <p className="text-sm font-medium">
            {client.tasks[0] ? client.tasks[0].updatedAt.toLocaleString("es-AR") : "-"}
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="mb-3 text-lg font-semibold">Deadlines cercanos</h2>
          {nextDeadlines.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin deadlines activos.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {nextDeadlines.map((task) => (
                <li key={task.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/dashboard/tasks/${task.id}`} className="underline hover:text-white">
                        {task.title}
                      </Link>
                      <p className="text-xs text-zinc-400">
                        {toHumanTaskStage({
                          state: task.state,
                          assignmentFlowStatus: task.assignmentFlowStatus,
                          hasEditor: Boolean(task.directEditorId),
                        })}{" "}
                        · {toHumanPriority(task.priority)}
                      </p>
                    </div>
                    <p className="text-xs text-zinc-300">{task.deadlineAt?.toLocaleString("es-AR")}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="mb-3 text-lg font-semibold">Historial de tareas</h2>
          {client.tasks.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin tareas asociadas.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {client.tasks.slice(0, 30).map((task) => {
                const accepted = task.assignments.find((assignment) => assignment.status === "ACCEPTED");
                const assigned = task.assignments.find((assignment) => assignment.status === "ASSIGNED");
                const editor =
                  accepted?.editor.displayName ??
                  assigned?.editor.displayName ??
                  task.directEditor?.displayName ??
                  "Sin asignar";
                return (
                  <li key={task.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/dashboard/tasks/${task.id}`} className="underline hover:text-white">
                          {task.title}
                        </Link>
                        <p className="text-xs text-zinc-400">
                          {editor} · {task.state}
                        </p>
                      </div>
                      <p className="text-xs text-zinc-300">
                        {task.deadlineAt ? task.deadlineAt.toLocaleDateString("es-AR") : "-"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
