import { AssignmentStatus, PaymentStatus, Role, TaskAssignmentFlowStatus, TaskState, UserStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { isCompletedState, toHumanPriority, toHumanTaskStage } from "@/lib/presentation/tasks";
import { continueAssignmentFlow, markExpiredOffers } from "@/lib/services/assignment-engine";
import { evaluateSlaAlertsForUser } from "@/lib/services/sla-alerts";
import { OwnerControls } from "./owner-controls";
import { SignOutButton } from "./signout-button";

type AlertLevel = "critical" | "warning" | "info";

function metricCard(label: string, value: number | string, href: string) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-800 bg-[#111827] p-4 transition hover:border-zinc-600"
    >
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-white">{value}</p>
    </Link>
  );
}

function alertClass(level: AlertLevel): string {
  if (level === "critical") return "border-red-700 bg-red-950/20 text-red-200";
  if (level === "warning") return "border-amber-700 bg-amber-950/20 text-amber-200";
  return "border-zinc-700 bg-zinc-900 text-zinc-200";
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const actor = session.user;
  const expiredTaskIds = await markExpiredOffers();
  for (const taskId of expiredTaskIds) {
    await continueAssignmentFlow(taskId, actor.id);
  }
  await evaluateSlaAlertsForUser(actor);
  const now = new Date();
  const nowTs = now.getTime();
  const in24h = new Date(nowTs + 24 * 60 * 60 * 1000);
  const in6h = new Date(nowTs + 6 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  if (actor.role === Role.EDITOR) {
    const [editorTasks, learningResources] = await Promise.all([
      prisma.task.findMany({
        where: {
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
        },
        include: {
          client: { select: { id: true, name: true, brandName: true } },
          assignments: {
            where: { editorId: actor.id },
            orderBy: { assignedAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              assignedAt: true,
              acceptedAt: true,
              completedAt: true,
            },
          },
        },
        orderBy: [{ deadlineAt: "asc" }, { createdAt: "desc" }],
        take: 200,
      }),
      prisma.learningResource.findMany({
        where: { isActive: true },
        select: { id: true, title: true, level: true, url: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    ]);

    const tasksWithContext = editorTasks.map((task) => {
      const ownAssignment = task.assignments[0] ?? null;
      const pendingAcceptance = ownAssignment?.status === AssignmentStatus.ASSIGNED;
      const inCorrection = task.state === TaskState.NEEDS_CORRECTION;
      const inReview = task.state === TaskState.UPLOADED || task.state === TaskState.IN_REVIEW;
      const completed =
        task.state === TaskState.APPROVED ||
        task.state === TaskState.DELIVERED ||
        task.state === TaskState.CLOSED;
      const editorStatus = completed
        ? "Completada"
        : inCorrection
          ? "Correccion"
          : inReview
            ? "En revision"
            : pendingAcceptance
              ? "Pendiente"
              : "En proceso";
      return {
        ...task,
        ownAssignment,
        editorStatus,
        pendingAcceptance,
      };
    });

    const activeTasks = tasksWithContext.filter(
      (task) =>
        task.state !== TaskState.CANCELLED &&
        task.state !== TaskState.CLOSED &&
        task.state !== TaskState.DELIVERED &&
        task.state !== TaskState.APPROVED,
    );
    const pendingAccept = tasksWithContext.filter((task) => task.pendingAcceptance).length;
    const overdue = activeTasks.filter((task) => Boolean(task.deadlineAt && task.deadlineAt < now)).length;
    const dueSoon = activeTasks.filter(
      (task) => Boolean(task.deadlineAt && task.deadlineAt >= now && task.deadlineAt <= in24h),
    ).length;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const dueToday = activeTasks.filter(
      (task) => Boolean(task.deadlineAt && task.deadlineAt >= todayStart && task.deadlineAt < tomorrowStart),
    ).length;
    const urgentNow = activeTasks.filter(
      (task) => Boolean(task.deadlineAt && task.deadlineAt <= in6h),
    ).length;
    const previewTasks = activeTasks.slice(0, 5);
    const urgentDeadlines = [...activeTasks]
      .filter((task) => Boolean(task.deadlineAt))
      .sort((a, b) => (a.deadlineAt?.getTime() ?? 0) - (b.deadlineAt?.getTime() ?? 0))
      .slice(0, 5);

    return (
      <main className="w-full px-2 py-2 text-white md:px-4">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">General</h1>
            <p className="text-sm text-zinc-400">Hola, {actor.name ?? actor.email}</p>
          </div>
          <SignOutButton />
        </header>

        <section className="mb-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="mb-3 text-lg font-semibold">Trabajo ahora</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Link href="/dashboard/tasks?deadline=vencidas" className="rounded-md border border-red-700 bg-red-950/20 px-3 py-2">
              <p className="text-xs text-red-300">Urgente</p>
              <p className="text-2xl font-semibold text-red-100">{urgentNow}</p>
            </Link>
            <Link href="/dashboard/tasks?deadline=hoy" className="rounded-md border border-amber-700 bg-amber-950/20 px-3 py-2">
              <p className="text-xs text-amber-300">Vence hoy</p>
              <p className="text-2xl font-semibold text-amber-100">{dueToday}</p>
            </Link>
            <Link href="/dashboard/tasks?estado=pendiente" className="rounded-md border border-blue-700 bg-blue-950/20 px-3 py-2">
              <p className="text-xs text-blue-300">Pendiente de aceptar</p>
              <p className="text-2xl font-semibold text-blue-100">{pendingAccept}</p>
            </Link>
          </div>
        </section>

        <section className="mb-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="mb-3 text-lg font-semibold">Alertas</h2>
          <div className="space-y-2">
            <Link
              href="/dashboard/tasks?estado=atrasadas"
              className="block rounded-md border border-red-700 bg-red-950/20 px-3 py-2 text-sm text-red-200"
            >
              Tenes {overdue} tareas atrasadas
            </Link>
            <Link
              href="/dashboard/tasks?deadline=24h"
              className="block rounded-md border border-amber-700 bg-amber-950/20 px-3 py-2 text-sm text-amber-200"
            >
              {dueSoon} tareas vencen en menos de 24h
            </Link>
            <Link
              href="/dashboard/tasks?estado=pendiente"
              className="block rounded-md border border-blue-700 bg-blue-950/20 px-3 py-2 text-sm text-blue-200"
            >
              Tenes {pendingAccept} tareas pendientes de aceptar
            </Link>
          </div>
        </section>

        <section className="mb-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Mis tareas activas</h2>
            <Link href="/dashboard/tasks" className="text-sm underline hover:text-white">
              Ver todas
            </Link>
          </div>
          {previewTasks.length === 0 ? (
            <p className="text-sm text-zinc-400">No tenes tareas activas ahora.</p>
          ) : (
            <div className="space-y-2">
              {previewTasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/dashboard/tasks/${task.id}`}
                  className="grid gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm md:grid-cols-5 md:items-center"
                >
                  <span className="font-medium">{task.title}</span>
                  <span>{task.client?.brandName ?? task.client?.name ?? "-"}</span>
                  <span>{task.editorStatus}</span>
                  <span>{task.deadlineAt ? task.deadlineAt.toLocaleString("es-AR") : "Sin deadline"}</span>
                  <span>{toHumanPriority(task.priority)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mb-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="mb-3 text-lg font-semibold">Deadlines</h2>
          {urgentDeadlines.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin deadlines cercanos.</p>
          ) : (
            <div className="space-y-2">
              {urgentDeadlines.map((task) => {
                const isOverdue = Boolean(task.deadlineAt && task.deadlineAt < now);
                const isSoon = Boolean(task.deadlineAt && task.deadlineAt >= now && task.deadlineAt <= in24h);
                const tone = isOverdue
                  ? "border-red-700 bg-red-950/20 text-red-200"
                  : isSoon
                    ? "border-amber-700 bg-amber-950/20 text-amber-200"
                    : "border-zinc-700 bg-zinc-900 text-zinc-200";
                return (
                  <Link
                    key={task.id}
                    href={`/dashboard/tasks/${task.id}`}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${tone}`}
                  >
                    <span>{task.title}</span>
                    <span>{task.deadlineAt?.toLocaleString("es-AR")}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Learning</h2>
            <Link href="/dashboard/learning" className="text-sm underline hover:text-white">
              Ir a learning
            </Link>
          </div>
          {learningResources.length === 0 ? (
            <p className="text-sm text-zinc-400">No hay recursos cargados.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {learningResources.map((item) => (
                <li key={item.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-zinc-400">{item.level.toLowerCase()}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    );
  }

  const isOwner = actor.role === Role.OWNER;
  const config = await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      assignmentMode: "AUTOMATIC",
      darkModeEnabled: true,
      editorSignupOpen: true,
    },
  });

  const [tasks, workers, pendingApprovals, monthlyMovements, totalReviews, correctionReviews] = await Promise.all([
    prisma.task.findMany({
      include: {
        assignments: {
          select: {
            editorId: true,
            status: true,
            assignedAt: true,
            completedAt: true,
            editor: { select: { id: true, displayName: true } },
          },
        },
        directEditor: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.user.findMany({
      where: { role: Role.EDITOR },
      select: { id: true, displayName: true, status: true, lastLoginAt: true },
      orderBy: { createdAt: "asc" },
      take: 400,
    }),
    prisma.editorEarning.count({ where: { status: PaymentStatus.PENDING_OWNER_APPROVAL } }),
    prisma.financialMovement.findMany({
      where: { occurredAt: { gte: monthStart } },
      select: { type: true, amount: true, status: true },
      take: 1000,
    }),
    prisma.review.count(),
    prisma.review.count({ where: { decision: "NEEDS_CORRECTION" } }),
  ]);

  const activeTasks = tasks.filter((task) => !isCompletedState(task.state));
  const overdueTasks = activeTasks.filter((task) => Boolean(task.deadlineAt && task.deadlineAt < now));
  const unassignedTasks = activeTasks.filter((task) => {
    const hasAssignment = task.assignments.some(
      (assignment) => assignment.status === AssignmentStatus.ASSIGNED || assignment.status === AssignmentStatus.ACCEPTED,
    );
    return !task.directEditorId && !hasAssignment;
  });
  const reviewStuck = activeTasks.filter(
    (task) => task.state === TaskState.IN_REVIEW && task.updatedAt.getTime() < nowTs - 48 * 60 * 60 * 1000,
  );
  const dueSoon = activeTasks.filter((task) => task.deadlineAt && task.deadlineAt >= now && task.deadlineAt <= in24h);
  const urgentNow = activeTasks.filter((task) => task.deadlineAt && task.deadlineAt <= in6h).length;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const dueToday = activeTasks.filter(
    (task) => Boolean(task.deadlineAt && task.deadlineAt >= todayStart && task.deadlineAt < tomorrowStart),
  ).length;
  const waitingAcceptance = tasks.filter((task) => {
    const hasEditor =
      Boolean(task.directEditorId) ||
      task.assignments.some(
        (assignment) => assignment.status === AssignmentStatus.ASSIGNED || assignment.status === AssignmentStatus.ACCEPTED,
      );
    return (
      toHumanTaskStage({
        state: task.state,
        assignmentFlowStatus: task.assignmentFlowStatus,
        hasEditor,
      }) === "Esperando aceptacion"
    );
  }).length;

  const flow: Record<string, number> = {
    "Sin asignar": 0,
    "Esperando aceptacion": 0,
    "En edicion": 0,
    "Para revisar": 0,
    Completada: 0,
  };
  for (const task of tasks) {
    const hasEditor =
      Boolean(task.directEditorId) ||
      task.assignments.some((assignment) => assignment.status === AssignmentStatus.ASSIGNED || assignment.status === AssignmentStatus.ACCEPTED);
    const stage = toHumanTaskStage({
      state: task.state,
      assignmentFlowStatus: task.assignmentFlowStatus,
      hasEditor,
    });
    flow[stage] += 1;
  }

  const activeLoadByWorker = new Map<string, number>();
  const failedDeadlinesByWorker = new Map<string, number>();
  for (const task of tasks) {
    for (const assignment of task.assignments) {
      const hasLoad =
        (assignment.status === AssignmentStatus.ASSIGNED || assignment.status === AssignmentStatus.ACCEPTED) &&
        !isCompletedState(task.state);
      if (hasLoad) {
        activeLoadByWorker.set(assignment.editorId, (activeLoadByWorker.get(assignment.editorId) ?? 0) + 1);
      }

      if (!task.deadlineAt || task.deadlineAt < monthStart) continue;
      const failedByCompletion =
        assignment.completedAt !== null && assignment.completedAt.getTime() > task.deadlineAt.getTime();
      const failedByOngoing =
        (assignment.status === AssignmentStatus.ASSIGNED || assignment.status === AssignmentStatus.ACCEPTED) &&
        !isCompletedState(task.state) &&
        task.deadlineAt.getTime() < nowTs;
      if (failedByCompletion || failedByOngoing) {
        failedDeadlinesByWorker.set(assignment.editorId, (failedDeadlinesByWorker.get(assignment.editorId) ?? 0) + 1);
      }
    }
  }

  const enabledWorkers = workers.filter((worker) => worker.status === UserStatus.ACTIVE);
  const onlineWorkers = enabledWorkers.filter(
    (worker) => worker.lastLoginAt && worker.lastLoginAt.getTime() > nowTs - 15 * 60 * 1000,
  );
  let free = 0;
  let busy = 0;
  let saturated = 0;
  for (const worker of enabledWorkers) {
    const load = activeLoadByWorker.get(worker.id) ?? 0;
    if (load <= 0) free += 1;
    else if (load <= 2) busy += 1;
    else saturated += 1;
  }
  const riskWorkers = Array.from(failedDeadlinesByWorker.values()).filter((count) => count > 0).length;
  const topLoadedWorker = workers
    .map((worker) => ({
      id: worker.id,
      name: worker.displayName,
      load: activeLoadByWorker.get(worker.id) ?? 0,
    }))
    .sort((a, b) => b.load - a.load)[0] ?? null;

  const finishedAssignments = tasks.flatMap((task) =>
    task.assignments
      .filter((assignment) => assignment.completedAt !== null)
      .map((assignment) => ({
        assignedAt: assignment.assignedAt,
        completedAt: assignment.completedAt,
      })),
  );
  const averageDeliveryMinutes =
    finishedAssignments.length > 0
      ? Math.round(
          finishedAssignments.reduce((sum, item) => {
            if (!item.completedAt) return sum;
            const duration = item.completedAt.getTime() - item.assignedAt.getTime();
            return sum + Math.max(duration, 0);
          }, 0) /
            finishedAssignments.length /
            (1000 * 60),
        )
      : 0;

  const timedAssignments = tasks.flatMap((task) =>
    task.assignments
      .filter((assignment) => assignment.completedAt !== null && task.deadlineAt !== null)
      .map((assignment) => ({
        completedAt: assignment.completedAt as Date,
        deadlineAt: task.deadlineAt as Date,
      })),
  );
  const onTimeRate =
    timedAssignments.length > 0
      ? Math.round(
          (timedAssignments.filter((item) => item.completedAt.getTime() <= item.deadlineAt.getTime()).length /
            timedAssignments.length) *
            100,
        )
      : 0;
  const returnRate = totalReviews > 0 ? Math.round((correctionReviews / totalReviews) * 100) : 0;

  const monthlyIncome = monthlyMovements
    .filter((item) => item.type === "INCOME" && item.status !== "CANCELLED")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const monthlyExpense = monthlyMovements
    .filter((item) => item.type === "EXPENSE" && item.status !== "CANCELLED")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const monthlyBalance = monthlyIncome - monthlyExpense;
  const pendingMovements = monthlyMovements.filter((item) => item.status === "PENDING").length;

  const tasksNeedManual = activeTasks.filter(
    (task) =>
      task.assignmentFlowStatus === TaskAssignmentFlowStatus.DIVIDED ||
      task.assignmentFlowStatus === TaskAssignmentFlowStatus.REJECTED ||
      (!task.directEditorId && task.assignments.length === 0),
  ).length;

  const alerts = [
    {
      label: `${overdueTasks.length} tareas atrasadas`,
      href: "/dashboard/deadlines?filtro=vencidas",
      level: "critical" as const,
      visible: overdueTasks.length > 0,
    },
    {
      label: `${unassignedTasks.length} tareas sin editor asignado`,
      href: "/dashboard/tasks?estado=sin_asignar",
      level: "warning" as const,
      visible: unassignedTasks.length > 0,
    },
    {
      label: `${reviewStuck.length} tareas en revision por mas de 48h`,
      href: "/dashboard/review",
      level: "warning" as const,
      visible: reviewStuck.length > 0,
    },
    {
      label: `${riskWorkers} workers con deadlines fallidos este mes`,
      href: "/dashboard/workers?filtro=riesgo",
      level: "warning" as const,
      visible: riskWorkers > 0,
    },
    {
      label: `${pendingApprovals + pendingMovements} pagos pendientes de registrar o aprobar`,
      href: "/dashboard/finance?filtro=pendientes",
      level: "info" as const,
      visible: isOwner && pendingApprovals + pendingMovements > 0,
    },
  ].filter((item) => item.visible);

  return (
    <main className="w-full px-2 py-2 text-white md:px-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">General</h1>
          <p className="text-sm text-zinc-400">Estado real del negocio y alertas accionables</p>
        </div>
        <SignOutButton />
      </header>

      <section className="mb-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Alertas</h2>
        {alerts.length === 0 ? (
          <p className="rounded-md border border-emerald-800 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
            Todo en orden. No hay alertas criticas.
          </p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <Link key={alert.label} href={alert.href} className={`block rounded-md border px-3 py-2 text-sm ${alertClass(alert.level)}`}>
                {alert.label}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mb-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Trabajo ahora</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Link href="/dashboard/deadlines?filtro=vencidas" className="rounded-md border border-red-700 bg-red-950/20 px-3 py-2">
            <p className="text-xs text-red-300">Urgente</p>
            <p className="text-2xl font-semibold text-red-100">{urgentNow}</p>
          </Link>
          <Link href="/dashboard/deadlines?filtro=hoy" className="rounded-md border border-amber-700 bg-amber-950/20 px-3 py-2">
            <p className="text-xs text-amber-300">Vence hoy</p>
            <p className="text-2xl font-semibold text-amber-100">{dueToday}</p>
          </Link>
          <Link href="/dashboard/tasks?estado=esperando_aceptacion" className="rounded-md border border-blue-700 bg-blue-950/20 px-3 py-2">
            <p className="text-xs text-blue-300">Pendiente de aceptar</p>
            <p className="text-2xl font-semibold text-blue-100">{waitingAcceptance}</p>
          </Link>
        </div>
      </section>

      {isOwner ? (
        <section className="mb-5">
          <OwnerControls
            assignmentMode={config.assignmentMode}
            pendingManualInterventions={tasksNeedManual}
          />
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        {metricCard("Tareas activas", activeTasks.length, "/dashboard/tasks?estado=activas")}
        {metricCard("Tareas atrasadas", overdueTasks.length, "/dashboard/deadlines?filtro=vencidas")}
        {metricCard("Tareas sin asignar", unassignedTasks.length, "/dashboard/tasks?estado=sin_asignar")}
        {metricCard(
          "Pagos pendientes",
          isOwner ? pendingApprovals + pendingMovements : pendingMovements,
          isOwner ? "/dashboard/finance?filtro=pendientes" : "/dashboard",
        )}
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h3 className="text-lg font-semibold">Estado del flujo</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {Object.entries(flow).map(([label, value]) => (
              <div key={label} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                <p className="text-zinc-400">{label}</p>
                <p className="text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h3 className="text-lg font-semibold">Workers y recursos</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
              <p className="text-zinc-400">Workers activos</p>
              <p className="text-xl font-semibold">{enabledWorkers.length}</p>
            </div>
            <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
              <p className="text-zinc-400">Online ahora</p>
              <p className="text-xl font-semibold">{onlineWorkers.length}</p>
            </div>
            <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
              <p className="text-zinc-400">Libres / Ocupados / Saturados</p>
              <p className="text-xl font-semibold">{`${free} / ${busy} / ${saturated}`}</p>
            </div>
            <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
              <p className="text-zinc-400">Con riesgo</p>
              <p className="text-xl font-semibold">{riskWorkers}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h3 className="text-lg font-semibold">Metricas accionables</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-4 text-sm">
          <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
            <p className="text-zinc-400">Tiempo medio de entrega</p>
            <p className="text-xl font-semibold">{averageDeliveryMinutes} min</p>
          </div>
          <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
            <p className="text-zinc-400">Tasa de devolucion</p>
            <p className="text-xl font-semibold">{returnRate}%</p>
          </div>
          <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
            <p className="text-zinc-400">Puntualidad</p>
            <p className="text-xl font-semibold">{onTimeRate}%</p>
          </div>
          <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
            <p className="text-zinc-400">Carga maxima por editor</p>
            <p className="text-xl font-semibold">
              {topLoadedWorker ? `${topLoadedWorker.load} (${topLoadedWorker.name})` : "0"}
            </p>
          </div>
        </div>
      </section>

      {isOwner ? (
        <section className="mt-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h3 className="text-lg font-semibold">Resumen financiero (mes actual)</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            {metricCard("Ingresos", `$${monthlyIncome.toFixed(2)}`, "/dashboard/finance?periodo=mes")}
            {metricCard("Egresos", `$${monthlyExpense.toFixed(2)}`, "/dashboard/finance?periodo=mes")}
            {metricCard("Balance", `$${monthlyBalance.toFixed(2)}`, "/dashboard/finance?periodo=mes")}
            {metricCard("Pagos pendientes", pendingApprovals + pendingMovements, "/dashboard/finance?filtro=pendientes")}
          </div>
        </section>
      ) : null}

      <section className="mt-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Deadlines proximos</h3>
          <Link href="/dashboard/deadlines" className="text-sm text-zinc-300 underline hover:text-white">
            Ver todos
          </Link>
        </div>
        {dueSoon.length === 0 ? (
          <p className="text-sm text-zinc-400">No hay deadlines en las proximas 24 horas.</p>
        ) : (
          <div className="space-y-2">
            {dueSoon.slice(0, 6).map((task) => (
              <Link
                key={task.id}
                href={`/dashboard/tasks/${task.id}`}
                className="flex items-center justify-between rounded-md border border-amber-700 bg-amber-950/20 px-3 py-2 text-sm text-amber-200"
              >
                <span>{task.title}</span>
                <span>{task.deadlineAt?.toLocaleString("es-AR")}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
