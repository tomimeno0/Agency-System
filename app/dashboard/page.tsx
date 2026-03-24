import {
  PaymentStatus,
  Role,
  TaskAssignmentFlowStatus,
  TaskState,
} from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { continueAssignmentFlow, markExpiredOffers } from "@/lib/services/assignment-engine";
import { SignOutButton } from "./signout-button";
import { OwnerControls } from "./owner-controls";

function metric(label: string, value: number | string) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const expiredTaskIds = await markExpiredOffers();
  for (const taskId of expiredTaskIds) {
    await continueAssignmentFlow(taskId, null);
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;

  if (user.role === Role.EDITOR) {
    const [assignedTasks, myOpenTasks, learningModules] = await Promise.all([
      prisma.taskAssignment.count({ where: { editorId: user.id } }),
      prisma.taskAssignment.count({
        where: {
          editorId: user.id,
          task: {
            state: {
              in: [TaskState.ACCEPTED, TaskState.IN_EDITING, TaskState.UPLOADED, TaskState.NEEDS_CORRECTION],
            },
          },
        },
      }),
      prisma.learningResource.count({ where: { isActive: true } }),
    ]);

    return (
      <main className="w-full px-2 py-2 text-white md:px-4">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard Editor</h1>
            <p className="text-sm text-zinc-400">Hola, {user.name ?? user.email}</p>
          </div>
          <SignOutButton />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {metric("Assigned tasks", assignedTasks)}
          {metric("Open tasks", myOpenTasks)}
          {metric("Learning modules", learningModules)}
        </section>

        <section className="mt-8 rounded-xl border border-zinc-800 bg-[#111827] p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Quick access</h2>
          <ul className="mt-4 space-y-2 text-sm text-zinc-300">
            <li>
              <Link className="underline" href="/dashboard/tasks">
                View my tasks
              </Link>
            </li>
            <li>
              <Link className="underline" href="/dashboard/learning">
                Learning resources
              </Link>
            </li>
            <li>
              <Link className="underline" href="/api/notifications?unreadOnly=true">
                Unread notifications
              </Link>
            </li>
          </ul>
        </section>
      </main>
    );
  }

  const config = await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      assignmentMode: "AUTOMATIC",
      darkModeEnabled: true,
    },
  });

  const [pendingOffers, acceptedTasks, failedAssignments, dividedTasks, pendingApprovals] =
    await Promise.all([
      prisma.task.count({ where: { assignmentFlowStatus: TaskAssignmentFlowStatus.PENDING_OFFER } }),
      prisma.task.count({ where: { assignmentFlowStatus: TaskAssignmentFlowStatus.ACCEPTED } }),
      prisma.task.count({ where: { assignmentFlowStatus: TaskAssignmentFlowStatus.REJECTED } }),
      prisma.task.count({ where: { assignmentFlowStatus: TaskAssignmentFlowStatus.DIVIDED } }),
      prisma.editorEarning.count({ where: { status: PaymentStatus.PENDING_OWNER_APPROVAL } }),
    ]);

  return (
    <main className="w-full px-2 py-2 text-white md:px-4">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard {user.role === Role.OWNER ? "Owner" : "Admin"}</h1>
          <p className="text-sm text-zinc-400">Assignment intelligence and operations</p>
        </div>
        <SignOutButton />
      </header>

      {user.role === Role.OWNER ? (
        <section className="mb-6">
          <OwnerControls assignmentMode={config.assignmentMode} />
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-5">
        {metric("Pending offers", pendingOffers)}
        {metric("Accepted", acceptedTasks)}
        {metric("Rejected/Failed", failedAssignments)}
        {metric("Divided", dividedTasks)}
        {metric("Pending payment approvals", pendingApprovals)}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Operations</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            <li>
              <Link className="underline" href="/dashboard/clients">
                Internal clients
              </Link>
            </li>
            <li>
              <Link className="underline" href="/dashboard/workers">
                Workers
              </Link>
            </li>
            <li>
              <Link className="underline" href="/dashboard/learning">
                Learning
              </Link>
            </li>
            <li>
              <Link className="underline" href="/dashboard/tasks">
                Tasks
              </Link>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Control</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            <li>
              <Link className="underline" href="/dashboard/finance">
                Financial ledger
              </Link>
            </li>
            {user.role === Role.OWNER ? (
              <li>
                <Link className="underline" href="/api/audit-logs">
                  Full audit log
                </Link>
              </li>
            ) : null}
            <li>
              <Link className="underline" href="/api/notifications?unreadOnly=true">
                Notifications
              </Link>
            </li>
            <li>
              <Link className="underline" href="/dashboard/security">
                Security sessions
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
