import { AssignmentStatus, Role, TaskState } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { toHumanPriority, toHumanTaskStage } from "@/lib/presentation/tasks";
import { TaskDetailPanel } from "./task-detail-panel";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const actor = session.user;
  const { taskId } = await params;
  const query = await searchParams;
  const tab = Array.isArray(query.tab) ? query.tab[0] : query.tab;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      client: { select: { id: true, name: true, brandName: true } },
      directEditor: { select: { id: true, displayName: true } },
      assignments: {
        include: {
          editor: { select: { id: true, displayName: true } },
        },
        orderBy: { assignedAt: "desc" },
      },
      statusHistory: {
        include: { changedBy: { select: { id: true, displayName: true } } },
        orderBy: { changedAt: "desc" },
        take: 50,
      },
      files: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!task) notFound();

  if (actor.role === Role.EDITOR) {
    const hasAccess = task.assignments.some((assignment) => assignment.editorId === actor.id);
    if (!hasAccess) redirect("/dashboard/tasks");
  }

  const isManager = actor.role === Role.OWNER || actor.role === Role.ADMIN;
  const editors = isManager
    ? await prisma.user.findMany({
        where: { role: Role.EDITOR, status: { not: "LOCKED" } },
        select: { id: true, displayName: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : [];

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
    <main>
      <div className="mb-4">
        <Link href="/dashboard/tasks" className="text-sm text-zinc-300 underline hover:text-white">
          Volver a tasks
        </Link>
      </div>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          <p className="text-sm text-zinc-400">
            {task.client?.brandName ?? task.client?.name ?? "Sin cliente"} · {editorName}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1">{stage}</span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1">
            Prioridad {toHumanPriority(task.priority)}
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1">
            {task.deadlineAt ? task.deadlineAt.toLocaleString("es-AR") : "Sin deadline"}
          </span>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <h2 className="mb-2 text-lg font-semibold">Descripcion</h2>
            <p className="text-sm text-zinc-300">{task.description || "Sin descripcion"}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <h2 className="mb-2 text-lg font-semibold">Instrucciones</h2>
            <p className="whitespace-pre-wrap text-sm text-zinc-300">
              {task.instructions || "Sin instrucciones"}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <h2 className="mb-3 text-lg font-semibold">Historial de estado</h2>
            {task.statusHistory.length === 0 ? (
              <p className="text-sm text-zinc-400">Sin historial.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {task.statusHistory.map((item) => (
                  <li key={item.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                    <p>
                      {item.fromState ?? "inicio"}
                      {" -> "}
                      {item.toState}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {item.changedBy.displayName} · {item.changedAt.toLocaleString("es-AR")}
                    </p>
                    {item.comment ? <p className="mt-1 text-xs text-zinc-300">{item.comment}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <h2 className="mb-3 text-lg font-semibold">Archivos</h2>
            {task.files.length === 0 ? (
              <p className="text-sm text-zinc-400">Sin archivos cargados.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {task.files.map((file) => (
                  <li key={file.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                    <p>{file.originalName}</p>
                    <p className="text-xs text-zinc-400">
                      {Math.round(file.sizeBytes / 1024)} KB · v{file.version}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <TaskDetailPanel
          taskId={task.id}
          currentState={task.state}
          tab={tab}
          isManager={isManager}
          editors={editors}
          assignments={task.assignments.map((assignment) => ({
            id: assignment.id,
            editorId: assignment.editorId,
            editorName: assignment.editor.displayName,
            status: assignment.status,
            assignedAt: assignment.assignedAt.toISOString(),
            acceptedAt: assignment.acceptedAt ? assignment.acceptedAt.toISOString() : null,
          }))}
          availableStates={Object.values(TaskState)}
        />
      </section>
    </main>
  );
}
