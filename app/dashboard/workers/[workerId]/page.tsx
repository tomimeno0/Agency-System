import { AssignmentStatus, Role, TaskState } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { isCompletedState, toHumanPriority, toHumanTaskStage } from "@/lib/presentation/tasks";
import { WorkerProfileActions } from "./worker-profile-actions";

function accountStatusLabel(status: string): string {
  if (status === "ACTIVE") return "Activo";
  if (status === "INACTIVE") return "Inactivo";
  if (status === "LOCKED") return "Bloqueado";
  if (status === "PENDING_APPROVAL") return "Pendiente";
  return status;
}

export default async function WorkerDetailPage({ params }: { params: Promise<{ workerId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role === Role.EDITOR) redirect("/dashboard");

  const { workerId } = await params;
  const [worker, assignments, notes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: workerId },
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    prisma.taskAssignment.findMany({
      where: { editorId: workerId },
      include: {
        task: {
          include: {
            client: { select: { id: true, name: true, brandName: true } },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
      take: 500,
    }),
    prisma.workerNote.findMany({
      where: { workerId },
      include: {
        author: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  if (!worker) notFound();

  const now = new Date();
  const nowTs = now.getTime();
  const activeAssignments = assignments.filter(
    (assignment) =>
      (assignment.status === AssignmentStatus.ASSIGNED || assignment.status === AssignmentStatus.ACCEPTED) &&
      !isCompletedState(assignment.task.state),
  );
  const pendingAcceptance = assignments.filter(
    (assignment) => assignment.status === AssignmentStatus.ASSIGNED && !isCompletedState(assignment.task.state),
  );
  const overdueAssignments = activeAssignments.filter(
    (assignment) => assignment.task.deadlineAt && assignment.task.deadlineAt.getTime() < nowTs,
  );
  const upcomingAssignments = activeAssignments
    .filter((assignment) => assignment.task.deadlineAt && assignment.task.deadlineAt.getTime() >= nowTs)
    .sort((a, b) => {
      if (!a.task.deadlineAt || !b.task.deadlineAt) return 0;
      return a.task.deadlineAt.getTime() - b.task.deadlineAt.getTime();
    })
    .slice(0, 8);

  const completedAssignments = assignments.filter(
    (assignment) =>
      assignment.status === AssignmentStatus.COMPLETED ||
      assignment.task.state === TaskState.APPROVED ||
      assignment.task.state === TaskState.DELIVERED ||
      assignment.task.state === TaskState.CLOSED,
  );
  const failedDeadlines = assignments.filter((assignment) => {
    if (!assignment.task.deadlineAt) return false;
    const failedByCompleted =
      assignment.completedAt !== null && assignment.completedAt.getTime() > assignment.task.deadlineAt.getTime();
    const failedByOpen =
      (assignment.status === AssignmentStatus.ASSIGNED || assignment.status === AssignmentStatus.ACCEPTED) &&
      !isCompletedState(assignment.task.state) &&
      assignment.task.deadlineAt.getTime() < nowTs;
    return failedByCompleted || failedByOpen;
  }).length;

  const deliveryDurations = assignments
    .filter((assignment) => assignment.completedAt !== null)
    .map((assignment) => assignment.completedAt!.getTime() - assignment.assignedAt.getTime());
  const averageDeliveryMinutes =
    deliveryDurations.length > 0
      ? Math.round(
          deliveryDurations.reduce((sum, duration) => sum + duration, 0) / deliveryDurations.length / (1000 * 60),
        )
      : null;

  const totalOffers = assignments.filter((assignment) =>
    [
      AssignmentStatus.ASSIGNED,
      AssignmentStatus.ACCEPTED,
      AssignmentStatus.REJECTED,
      AssignmentStatus.COMPLETED,
      AssignmentStatus.CANCELLED,
      AssignmentStatus.EXPIRED,
    ].includes(assignment.status),
  ).length;
  const acceptedOffers = assignments.filter((assignment) =>
    assignment.status === AssignmentStatus.ACCEPTED || assignment.status === AssignmentStatus.COMPLETED,
  ).length;
  const acceptanceRate = totalOffers > 0 ? (acceptedOffers / totalOffers) * 100 : 0;

  const onlineNow = worker.lastLoginAt !== null && worker.lastLoginAt.getTime() > nowTs - 15 * 60 * 1000;
  const workload = activeAssignments.length >= 3 ? "Saturado" : activeAssignments.length >= 1 ? "Ocupado" : "Libre";

  const canManage = session.user.role === Role.OWNER || session.user.role === Role.ADMIN;
  const canDelete = session.user.role === Role.OWNER;

  return (
    <main>
      <div className="mb-4">
        <Link href="/dashboard/workers" className="text-sm text-zinc-300 underline hover:text-white">
          Volver a workers
        </Link>
      </div>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{worker.displayName}</h1>
          <p className="text-sm text-zinc-400">{worker.email}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1">
            Cuenta: {accountStatusLabel(worker.status)}
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1">
            {onlineNow ? "Online ahora" : "Offline"}
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1">
            Workload: {workload} ({activeAssignments.length})
          </span>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-3 rounded-xl border border-zinc-800 bg-[#111827] p-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-zinc-400">Acceptance rate</p>
              <p className="text-2xl font-semibold">{Math.round(acceptanceRate)}%</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Deadlines fallidos</p>
              <p className="text-2xl font-semibold">{failedDeadlines}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Promedio entrega</p>
              <p className="text-2xl font-semibold">{averageDeliveryMinutes ?? "-"} min</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Tareas activas</p>
              <p className="text-2xl font-semibold">{activeAssignments.length}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Pendientes de aceptar</p>
              <p className="text-2xl font-semibold">{pendingAcceptance.length}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Tareas completadas</p>
              <p className="text-2xl font-semibold">{completedAssignments.length}</p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <h2 className="mb-3 text-lg font-semibold">Proximos deadlines</h2>
            {upcomingAssignments.length === 0 ? (
              <p className="text-sm text-zinc-400">Sin deadlines proximos.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {upcomingAssignments.map((assignment) => {
                  const stage = toHumanTaskStage({
                    state: assignment.task.state,
                    assignmentFlowStatus: assignment.task.assignmentFlowStatus,
                    hasEditor: true,
                  });
                  return (
                    <li key={assignment.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p>{assignment.task.title}</p>
                          <p className="text-xs text-zinc-400">
                            {assignment.task.client?.brandName ?? assignment.task.client?.name ?? "-"} |{" "}
                            {toHumanPriority(assignment.task.priority)} | {stage}
                          </p>
                        </div>
                        <p className="text-xs text-zinc-300">
                          {assignment.task.deadlineAt?.toLocaleString("es-AR")}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <h2 className="mb-3 text-lg font-semibold">Historial de tareas</h2>
            {assignments.length === 0 ? (
              <p className="text-sm text-zinc-400">Sin historial.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-700 text-zinc-300">
                    <tr>
                      <th className="px-2 py-2 font-medium">Tarea</th>
                      <th className="px-2 py-2 font-medium">Cliente</th>
                      <th className="px-2 py-2 font-medium">Estado</th>
                      <th className="px-2 py-2 font-medium">Deadline</th>
                      <th className="px-2 py-2 font-medium">Asignada</th>
                      <th className="px-2 py-2 font-medium">Entrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.slice(0, 80).map((assignment) => (
                      <tr key={assignment.id} className="border-b border-zinc-800">
                        <td className="px-2 py-2">
                          <Link href={`/dashboard/tasks/${assignment.taskId}`} className="underline hover:text-white">
                            {assignment.task.title}
                          </Link>
                        </td>
                        <td className="px-2 py-2">
                          {assignment.task.client?.brandName ?? assignment.task.client?.name ?? "-"}
                        </td>
                        <td className="px-2 py-2">{assignment.status}</td>
                        <td className="px-2 py-2">
                          {assignment.task.deadlineAt ? assignment.task.deadlineAt.toLocaleString("es-AR") : "-"}
                        </td>
                        <td className="px-2 py-2">{assignment.assignedAt.toLocaleDateString("es-AR")}</td>
                        <td className="px-2 py-2">
                          {assignment.completedAt ? assignment.completedAt.toLocaleDateString("es-AR") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <WorkerProfileActions
          workerId={worker.id}
          canManage={canManage}
          canDelete={canDelete}
          currentStatus={worker.status}
          notes={notes.map((note) => ({
            id: note.id,
            content: note.content,
            createdAt: note.createdAt.toISOString(),
            authorName: note.author.displayName,
          }))}
          overdueCount={overdueAssignments.length}
        />
      </section>
    </main>
  );
}
