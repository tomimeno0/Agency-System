import { AssignmentStatus, Role, TaskState, UserStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { isCompletedState } from "@/lib/presentation/tasks";
import { WorkersManager } from "./workers-manager";

export default async function WorkersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role === Role.EDITOR) redirect("/dashboard");

  const now = new Date();
  const nowTs = now.getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const inactivityDays = 5;
  const inactiveSince = new Date(nowTs - inactivityDays * 24 * 60 * 60 * 1000);

  await prisma.user.updateMany({
    where: {
      role: Role.EDITOR,
      status: UserStatus.ACTIVE,
      OR: [
        {
          lastLoginAt: {
            lt: inactiveSince,
          },
        },
        {
          lastLoginAt: null,
          createdAt: {
            lt: inactiveSince,
          },
        },
      ],
    },
    data: { status: UserStatus.INACTIVE },
  });

  const [workers, assignments] = await Promise.all([
    prisma.user.findMany({
      where: { role: Role.EDITOR },
      select: {
        id: true,
        displayName: true,
        email: true,
        createdAt: true,
        role: true,
        status: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    prisma.taskAssignment.findMany({
      where: {
        editor: { role: Role.EDITOR },
      },
      select: {
        editorId: true,
        status: true,
        assignedAt: true,
        completedAt: true,
        task: {
          select: {
            state: true,
            deadlineAt: true,
          },
        },
      },
      orderBy: { assignedAt: "desc" },
      take: 4000,
    }),
  ]);

  const metrics = new Map<
    string,
    {
      active: number;
      pendingOffer: number;
      completed: number;
      failedDeadlines: number;
      avgDeliveryMinutes: number | null;
      acceptedOffers: number;
      totalOffers: number;
    }
  >();
  const durationsByWorker = new Map<string, number[]>();

  for (const worker of workers) {
    metrics.set(worker.id, {
      active: 0,
      pendingOffer: 0,
      completed: 0,
      failedDeadlines: 0,
      avgDeliveryMinutes: null,
      acceptedOffers: 0,
      totalOffers: 0,
    });
  }

  for (const assignment of assignments) {
    const workerMetrics = metrics.get(assignment.editorId);
    if (!workerMetrics) continue;

    const activeLoad =
      (assignment.status === AssignmentStatus.ASSIGNED ||
        assignment.status === AssignmentStatus.ACCEPTED) &&
      !isCompletedState(assignment.task.state);
    if (activeLoad) {
      workerMetrics.active += 1;
    }

    const completed =
      assignment.status === AssignmentStatus.COMPLETED ||
      assignment.task.state === TaskState.APPROVED ||
      assignment.task.state === TaskState.DELIVERED ||
      assignment.task.state === TaskState.CLOSED;
    if (completed) {
      workerMetrics.completed += 1;
    }

    if (
      assignment.status === AssignmentStatus.ASSIGNED ||
      assignment.status === AssignmentStatus.ACCEPTED ||
      assignment.status === AssignmentStatus.REJECTED ||
      assignment.status === AssignmentStatus.COMPLETED ||
      assignment.status === AssignmentStatus.CANCELLED ||
      assignment.status === AssignmentStatus.EXPIRED
    ) {
      workerMetrics.totalOffers += 1;
      if (
        assignment.status === AssignmentStatus.ACCEPTED ||
        assignment.status === AssignmentStatus.COMPLETED
      ) {
        workerMetrics.acceptedOffers += 1;
      }
    }

    if (assignment.status === AssignmentStatus.ASSIGNED && !isCompletedState(assignment.task.state)) {
      workerMetrics.pendingOffer += 1;
    }

    if (assignment.task.deadlineAt && assignment.task.deadlineAt >= monthStart) {
      const failedByCompletion =
        assignment.completedAt !== null &&
        assignment.completedAt.getTime() > assignment.task.deadlineAt.getTime();
      const failedByOpen =
        (assignment.status === AssignmentStatus.ASSIGNED ||
          assignment.status === AssignmentStatus.ACCEPTED) &&
        assignment.task.deadlineAt.getTime() < nowTs &&
        !isCompletedState(assignment.task.state);
      if (failedByCompletion || failedByOpen) {
        workerMetrics.failedDeadlines += 1;
      }
    }

    if (assignment.completedAt) {
      const list = durationsByWorker.get(assignment.editorId) ?? [];
      list.push(assignment.completedAt.getTime() - assignment.assignedAt.getTime());
      durationsByWorker.set(assignment.editorId, list);
    }
  }

  for (const worker of workers) {
    const data = metrics.get(worker.id);
    if (!data) continue;
    const durations = durationsByWorker.get(worker.id) ?? [];
    if (durations.length > 0) {
      data.avgDeliveryMinutes = Math.round(
        durations.reduce((sum, item) => sum + item, 0) / durations.length / (1000 * 60),
      );
    }
  }

  const items = workers.map((worker) => {
    const data = metrics.get(worker.id);
    const active = data?.active ?? 0;
    const workloadTag = active >= 3 ? "Saturado" : active >= 1 ? "Ocupado" : "Libre";
    const onlineStatus =
      worker.lastLoginAt && worker.lastLoginAt.getTime() > nowTs - 15 * 60 * 1000
        ? ("ONLINE" as const)
        : ("OFFLINE" as const);
    const acceptedOffers = data?.acceptedOffers ?? 0;
    const totalOffers = data?.totalOffers ?? 0;
    const acceptanceRate = totalOffers > 0 ? acceptedOffers / totalOffers : 0;

    return {
      id: worker.id,
      displayName: worker.displayName,
      email: worker.email,
      createdAt: worker.createdAt.toISOString(),
      role: worker.role,
      accountStatus: worker.status,
      onlineStatus,
      workloadCount: active,
      workloadTag,
      acceptanceRate,
      pendingOfferCount: data?.pendingOffer ?? 0,
      failedDeadlines: data?.failedDeadlines ?? 0,
      completedTasks: data?.completed ?? 0,
      avgDeliveryMinutes: data?.avgDeliveryMinutes ?? null,
    };
  });

  const canManage = session.user.role === Role.OWNER || session.user.role === Role.ADMIN;
  const canDelete = session.user.role === Role.OWNER;
  return <WorkersManager initialWorkers={items} canManage={canManage} canDelete={canDelete} />;
}
