import { AssignmentStatus, Role, TaskPriority, TaskState } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { isCompletedState, toHumanPriority, toHumanTaskStage } from "@/lib/presentation/tasks";
import { EditorTasksBoard } from "./editor-tasks-board";
import { TaskRowActions } from "./task-row-actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pickFirst(value: string | string[] | undefined): string {
  if (!value) return "todos";
  return Array.isArray(value) ? value[0] ?? "todos" : value;
}

function priorityBadge(priority: TaskPriority): string {
  if (priority === TaskPriority.URGENT || priority === TaskPriority.HIGH) {
    return "border border-red-700 bg-red-950/25 text-red-200";
  }
  if (priority === TaskPriority.MEDIUM) {
    return "border border-amber-700 bg-amber-950/25 text-amber-200";
  }
  return "border border-emerald-700 bg-emerald-950/25 text-emerald-200";
}

function stageBadge(stage: string): string {
  if (stage === "Sin asignar") return "border border-zinc-600 bg-zinc-900 text-zinc-200";
  if (stage === "Esperando aceptacion") return "border border-amber-700 bg-amber-950/20 text-amber-200";
  if (stage === "En edicion") return "border border-blue-700 bg-blue-950/20 text-blue-200";
  if (stage === "Para revisar") return "border border-violet-700 bg-violet-950/20 text-violet-200";
  return "border border-emerald-700 bg-emerald-950/20 text-emerald-200";
}

function mapEditorStatus(taskState: TaskState, assignmentStatus?: AssignmentStatus): "Pendiente" | "En proceso" | "En revision" | "Correccion" | "Completada" {
  if (
    taskState === TaskState.APPROVED ||
    taskState === TaskState.DELIVERED ||
    taskState === TaskState.CLOSED ||
    taskState === TaskState.CANCELLED
  ) {
    return "Completada";
  }
  if (taskState === TaskState.NEEDS_CORRECTION) return "Correccion";
  if (taskState === TaskState.UPLOADED || taskState === TaskState.IN_REVIEW) return "En revision";
  if (assignmentStatus === AssignmentStatus.ASSIGNED) return "Pendiente";
  return "En proceso";
}

function normalizeEditorFilters(input: {
  estado: string;
  prioridad: string;
  deadline: string;
  cliente: string;
}) {
  const byEstado: Record<string, string> = {
    pendiente: "Pendiente",
    en_proceso: "En proceso",
    en_revision: "En revision",
    correccion: "Correccion",
    completada: "Completada",
  };

  let mappedDeadline = input.deadline;
  if (input.estado === "atrasadas") {
    mappedDeadline = "vencidas";
  }

  return {
    estado: byEstado[input.estado] ?? "todos",
    prioridad:
      input.prioridad === "alta"
        ? "Alta"
        : input.prioridad === "media"
          ? "Media"
          : input.prioridad === "baja"
            ? "Baja"
            : "todos",
    deadline:
      mappedDeadline === "24h" ||
      mappedDeadline === "48h" ||
      mappedDeadline === "hoy" ||
      mappedDeadline === "vencidas" ||
      mappedDeadline === "sin_deadline"
        ? mappedDeadline
        : "todos",
    cliente: input.cliente,
  };
}

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const actor = session.user;
  const query = await searchParams;
  const estado = pickFirst(query.estado);
  const prioridad = pickFirst(query.prioridad);
  const clienteFiltro = pickFirst(query.cliente);
  const editorFiltro = pickFirst(query.editor);
  const deadlineFiltro = pickFirst(query.deadline);
  const overdueOnly = pickFirst(query.overdue) === "1";
  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDay = new Date(startDay.getTime() + 24 * 60 * 60 * 1000);
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const tasks = await prisma.task.findMany({
    where:
      actor.role === Role.EDITOR
        ? {
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
              {
                directEditorId: actor.id,
              },
            ],
          }
        : undefined,
    include: {
      client: { select: { id: true, name: true, brandName: true } },
      directEditor: { select: { id: true, displayName: true } },
      assignments:
        actor.role === Role.EDITOR
          ? {
              where: { editorId: actor.id },
              orderBy: { assignedAt: "desc" },
              take: 1,
              select: {
                id: true,
                editorId: true,
                status: true,
                editor: { select: { id: true, displayName: true } },
              },
            }
          : {
              select: {
                id: true,
                editorId: true,
                status: true,
                editor: { select: { id: true, displayName: true } },
              },
            },
    },
    orderBy: [{ deadlineAt: "asc" }, { createdAt: "desc" }],
    take: 600,
  });

  if (actor.role === Role.EDITOR) {
    const filters = normalizeEditorFilters({
      estado,
      prioridad,
      deadline: deadlineFiltro,
      cliente: clienteFiltro,
    });

    const editorRows = tasks.map((task) => {
      const ownAssignment = task.assignments[0];
      const clientName = task.client?.brandName ?? task.client?.name ?? "-";
      const status = mapEditorStatus(task.state, ownAssignment?.status);
      const canDeliver =
        Boolean(ownAssignment?.id) && (status === "En proceso" || status === "Correccion");

      return {
        id: task.id,
        title: task.title,
        clientName,
        status,
        deadlineAt: task.deadlineAt ? task.deadlineAt.toISOString() : null,
        priority: toHumanPriority(task.priority),
        assignmentId: ownAssignment?.id ?? null,
        pendingAcceptance: ownAssignment?.status === AssignmentStatus.ASSIGNED,
        canDeliver,
      };
    });

    return <EditorTasksBoard tasks={editorRows} initialFilters={filters} />;
  }

  const clients = Array.from(
    new Map(
      tasks
        .filter((task) => task.client)
        .map((task) => [task.client?.id ?? "", { id: task.client?.id ?? "", name: task.client?.brandName ?? task.client?.name ?? "-" }]),
    ).values(),
  ).filter((item) => item.id);

  const editors = Array.from(
    new Map(
      tasks.flatMap((task) => {
        const editor =
          task.assignments.find((assignment) => assignment.status === AssignmentStatus.ACCEPTED)?.editor ??
          task.assignments.find((assignment) => assignment.status === AssignmentStatus.ASSIGNED)?.editor ??
          task.directEditor;
        return editor ? [[editor.id, { id: editor.id, name: editor.displayName }]] : [];
      }),
    ).values(),
  );

  const rows = tasks
    .map((task) => {
      const accepted = task.assignments.find((assignment) => assignment.status === AssignmentStatus.ACCEPTED);
      const offered = task.assignments.find((assignment) => assignment.status === AssignmentStatus.ASSIGNED);
      const editor = accepted?.editor ?? offered?.editor ?? task.directEditor;
      const hasEditor =
        Boolean(task.directEditorId) ||
        task.assignments.some(
          (assignment) =>
            assignment.status === AssignmentStatus.ASSIGNED ||
            assignment.status === AssignmentStatus.ACCEPTED,
        );
      const stage = toHumanTaskStage({
        state: task.state,
        assignmentFlowStatus: task.assignmentFlowStatus,
        hasEditor,
      });
      return {
        ...task,
        stage,
        editor,
      };
    })
    .filter((task) => {
      if (estado === "activas") return !isCompletedState(task.state);
      if (estado === "sin_asignar") return task.stage === "Sin asignar";
      if (estado === "esperando_aceptacion") return task.stage === "Esperando aceptacion";
      if (estado === "en_edicion") return task.stage === "En edicion";
      if (estado === "en_revision") return task.stage === "Para revisar";
      if (estado === "completada") return task.stage === "Completada";
      return true;
    })
    .filter((task) => {
      if (prioridad === "alta") return task.priority === TaskPriority.HIGH || task.priority === TaskPriority.URGENT;
      if (prioridad === "media") return task.priority === TaskPriority.MEDIUM;
      if (prioridad === "baja") return task.priority === TaskPriority.LOW;
      return true;
    })
    .filter((task) => (clienteFiltro !== "todos" ? task.client?.id === clienteFiltro : true))
    .filter((task) => (editorFiltro !== "todos" ? task.editor?.id === editorFiltro : true))
    .filter((task) => {
      if (overdueOnly) return Boolean(task.deadlineAt && task.deadlineAt < now && !isCompletedState(task.state));
      if (deadlineFiltro === "sin_deadline") return task.deadlineAt === null;
      if (!task.deadlineAt) return deadlineFiltro === "todos";
      if (deadlineFiltro === "hoy") return task.deadlineAt >= startDay && task.deadlineAt < endDay;
      if (deadlineFiltro === "24h") return task.deadlineAt >= now && task.deadlineAt <= next24h;
      if (deadlineFiltro === "48h") return task.deadlineAt >= now && task.deadlineAt <= next48h;
      return true;
    });

  return (
    <main className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Tasks</h1>
          <p className="text-base text-zinc-400">Control de flujo con filtros operativos</p>
        </div>
        <Link
          href="/dashboard/tasks/new"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-base hover:bg-zinc-800"
        >
          Crear task
        </Link>
      </div>

      <form className="mb-5 grid gap-2 rounded-xl border border-zinc-800 bg-[#111827] p-4 md:grid-cols-6">
        <select
          name="estado"
          defaultValue={estado}
          className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-base"
        >
          <option value="todos">Estado: todos</option>
          <option value="activas">Activas</option>
          <option value="sin_asignar">Sin asignar</option>
          <option value="esperando_aceptacion">Esperando aceptacion</option>
          <option value="en_edicion">En edicion</option>
          <option value="en_revision">Para revisar</option>
          <option value="completada">Completadas</option>
        </select>
        <select
          name="prioridad"
          defaultValue={prioridad}
          className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-base"
        >
          <option value="todos">Prioridad: todas</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <select
          name="cliente"
          defaultValue={clienteFiltro}
          className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-base"
        >
          <option value="todos">Cliente: todos</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <select
          name="editor"
          defaultValue={editorFiltro}
          className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-base"
        >
          <option value="todos">Editor: todos</option>
          {editors.map((editor) => (
            <option key={editor.id} value={editor.id}>
              {editor.name}
            </option>
          ))}
        </select>
        <select
          name="deadline"
          defaultValue={deadlineFiltro}
          className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-base"
        >
          <option value="todos">Deadline: todos</option>
          <option value="hoy">Hoy</option>
          <option value="24h">Proximas 24h</option>
          <option value="48h">Proximas 48h</option>
          <option value="sin_deadline">Sin deadline</option>
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-base hover:bg-zinc-800"
          >
            Filtrar
          </button>
          <Link
            href="/dashboard/tasks"
            className="h-11 w-full rounded-md border border-zinc-700 px-3 text-center text-base leading-[44px] hover:bg-zinc-800"
          >
            Limpiar
          </Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111827]">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No hay tareas para este filtro.</p>
        ) : (
          <table className="w-full text-left text-base">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-4 font-medium">Titulo</th>
                <th className="px-4 py-4 font-medium">Cliente</th>
                <th className="px-4 py-4 font-medium">Editor</th>
                <th className="px-4 py-4 font-medium">Estado</th>
                <th className="px-4 py-4 font-medium">Prioridad</th>
                <th className="px-4 py-4 font-medium">Deadline</th>
                <th className="px-4 py-4 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => (
                <tr key={task.id} className="border-b border-zinc-800">
                  <td className="px-4 py-4">{task.title}</td>
                  <td className="px-4 py-4">{task.client?.brandName ?? task.client?.name ?? "-"}</td>
                  <td className="px-4 py-4">{task.editor?.displayName ?? "Sin asignar"}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-sm ${stageBadge(task.stage)}`}>
                        {task.stage}
                      </span>
                      <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-sm text-zinc-300">
                        {task.assignmentMode === "AUTOMATIC" ? "Auto" : "Manual"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-sm ${priorityBadge(task.priority)}`}>
                      {toHumanPriority(task.priority)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {task.deadlineAt ? task.deadlineAt.toLocaleString("es-AR") : "Sin deadline"}
                  </td>
                  <td className="px-4 py-4">
                    <TaskRowActions
                      taskId={task.id}
                      canManage
                      canDelete={actor.role === Role.OWNER}
                      canArchive={task.state !== TaskState.CLOSED && task.state !== TaskState.CANCELLED}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
