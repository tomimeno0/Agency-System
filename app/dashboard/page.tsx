import { PaymentStatus, Role, TaskState } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { SignOutButton } from "./signout-button";

function metric(label: string, value: number | string) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;

  if (user.role === Role.EDITOR) {
    const [assignedTasks, myOpenTasks, myEarnings] = await Promise.all([
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
      prisma.editorEarning.aggregate({
        where: { editorId: user.id },
        _sum: { editorNetAmount: true },
      }),
    ]);

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard Editor</h1>
            <p className="text-sm text-slate-600">Hola, {user.name ?? user.email}</p>
          </div>
          <SignOutButton />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {metric("Assigned tasks", assignedTasks)}
          {metric("Open tasks", myOpenTasks)}
          {metric("Total earnings", myEarnings._sum.editorNetAmount?.toString() ?? "0")}
        </section>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Quick access</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link className="text-slate-900 underline" href="/api/tasks">
                View my tasks
              </Link>
            </li>
            <li>
              <Link className="text-slate-900 underline" href="/api/learning/resources">
                Learning resources
              </Link>
            </li>
            <li>
              <Link className="text-slate-900 underline" href="/api/notifications?unreadOnly=true">
                Unread notifications
              </Link>
            </li>
          </ul>
        </section>
      </main>
    );
  }

  const [pendingTasks, inReview, overdueTasks, pendingApprovals] = await Promise.all([
    prisma.task.count({ where: { state: TaskState.PENDING_ASSIGNMENT } }),
    prisma.task.count({ where: { state: TaskState.IN_REVIEW } }),
    prisma.task.count({
      where: {
        deadlineAt: { lt: new Date() },
        state: { in: [TaskState.PENDING_ASSIGNMENT, TaskState.OFFERED, TaskState.ACCEPTED, TaskState.IN_EDITING] },
      },
    }),
    prisma.editorEarning.count({ where: { status: PaymentStatus.PENDING_OWNER_APPROVAL } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard {user.role === Role.OWNER ? "Owner" : "Admin"}</h1>
          <p className="text-sm text-slate-600">Agency operations and control</p>
        </div>
        <SignOutButton />
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {metric("Pending assignment", pendingTasks)}
        {metric("In review", inReview)}
        {metric("Overdue", overdueTasks)}
        {metric("Pending payment approvals", pendingApprovals)}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Operations</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="underline" href="/api/clients">
                Internal clients
              </Link>
            </li>
            <li>
              <Link className="underline" href="/api/projects">
                Projects
              </Link>
            </li>
            <li>
              <Link className="underline" href="/api/tasks">
                Tasks
              </Link>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Control</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="underline" href="/api/finance/ledger">
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
          </ul>
        </div>
      </section>
    </main>
  );
}
