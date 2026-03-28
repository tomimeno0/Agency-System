import { Role, ReviewDecision, TaskState } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";

function toSubmissionStatus(
  decision: ReviewDecision | null,
  taskState: TaskState,
): "En revision" | "Aprobado" | "Rechazado" {
  if (decision === ReviewDecision.APPROVED) return "Aprobado";
  if (decision === ReviewDecision.NEEDS_CORRECTION) return "Rechazado";
  if (
    taskState === TaskState.APPROVED ||
    taskState === TaskState.DELIVERED ||
    taskState === TaskState.CLOSED
  ) {
    return "Aprobado";
  }
  if (taskState === TaskState.NEEDS_CORRECTION) return "Rechazado";
  return "En revision";
}

function statusBadge(status: "En revision" | "Aprobado" | "Rechazado"): string {
  if (status === "Aprobado") return "border border-emerald-700 bg-emerald-950/20 text-emerald-200";
  if (status === "Rechazado") return "border border-red-700 bg-red-950/20 text-red-200";
  return "border border-amber-700 bg-amber-950/20 text-amber-200";
}

export default async function SubmissionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.EDITOR) redirect("/dashboard");

  const submissions = await prisma.submission.findMany({
    where: {
      taskAssignment: {
        editorId: session.user.id,
      },
    },
    include: {
      taskAssignment: {
            select: {
              taskId: true,
              task: {
                select: {
                  title: true,
                  state: true,
                  client: {
                    select: {
                      name: true,
                  brandName: true,
                },
              },
            },
          },
        },
      },
      reviews: {
        select: {
          decision: true,
          reviewedAt: true,
        },
        orderBy: { reviewedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { submittedAt: "desc" },
    take: 300,
  });

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-3xl font-semibold">Entregas</h1>
        <p className="text-base text-zinc-400">Seguimiento de todo lo que ya entregaste.</p>
      </header>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111827]">
        {submissions.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">Todavia no hiciste entregas.</p>
        ) : (
          <table className="w-full text-left text-base">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-4 font-medium">Tarea</th>
                <th className="px-4 py-4 font-medium">Cliente</th>
                <th className="px-4 py-4 font-medium">Fecha</th>
                <th className="px-4 py-4 font-medium">Estado</th>
                <th className="px-4 py-4 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => {
                const latestDecision = submission.reviews[0]?.decision ?? null;
                const status = toSubmissionStatus(latestDecision, submission.taskAssignment.task.state);
                const clientName =
                  submission.taskAssignment.task.client?.brandName ??
                  submission.taskAssignment.task.client?.name ??
                  "-";
                return (
                  <tr key={submission.id} className="border-b border-zinc-800">
                    <td className="px-4 py-4">{submission.taskAssignment.task.title}</td>
                    <td className="px-4 py-4">{clientName}</td>
                    <td className="px-4 py-4">{submission.submittedAt.toLocaleString("es-AR")}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-sm ${statusBadge(status)}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/dashboard/submissions/${submission.id}`}
                        className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                      >
                        Ver entrega
                      </Link>
                    </td>
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
