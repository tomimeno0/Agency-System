import { Role, TaskState } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { FileDownloadButton } from "@/app/dashboard/_components/file-download-button";
import { prisma } from "@/lib/db";
import { ReviewActions } from "./review-actions";

export default async function ReviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role === Role.EDITOR) redirect("/dashboard");

  const pendingSubmissions = await prisma.submission.findMany({
    where: {
      reviews: { none: {} },
      taskAssignment: {
        task: {
          state: {
            in: [TaskState.UPLOADED, TaskState.IN_REVIEW],
          },
        },
      },
    },
    include: {
      taskAssignment: {
        include: {
          editor: { select: { displayName: true } },
          task: {
            select: {
              id: true,
              title: true,
              state: true,
              deadlineAt: true,
              client: { select: { name: true, brandName: true } },
            },
          },
        },
      },
      file: true,
    },
    orderBy: [{ submittedAt: "asc" }],
    take: 300,
  });

  return (
    <main className="w-full">
      <header className="mb-4">
        <h1 className="text-3xl font-semibold">Revision</h1>
        <p className="text-base text-zinc-400">Tareas listas para revisar y decidir.</p>
      </header>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111827]">
        {pendingSubmissions.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No hay tareas pendientes de revision.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Tarea</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Editor</th>
                <th className="px-4 py-3 font-medium">Entregada</th>
                <th className="px-4 py-3 font-medium">Archivo</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pendingSubmissions.map((submission) => {
                const task = submission.taskAssignment.task;
                const clientName = task.client?.brandName ?? task.client?.name ?? "-";
                return (
                  <tr key={submission.id} className="border-b border-zinc-800 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-xs text-zinc-400">
                        {task.deadlineAt ? `Deadline: ${task.deadlineAt.toLocaleString("es-AR")}` : "Sin deadline"}
                      </p>
                    </td>
                    <td className="px-4 py-3">{clientName}</td>
                    <td className="px-4 py-3">{submission.taskAssignment.editor.displayName}</td>
                    <td className="px-4 py-3">{submission.submittedAt.toLocaleString("es-AR")}</td>
                    <td className="px-4 py-3">
                      {submission.file ? (
                        <FileDownloadButton fileId={submission.file.id} label="Descargar original" />
                      ) : (
                        <span className="text-zinc-400">Sin archivo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="mb-2">
                        <Link
                          href={`/dashboard/tasks/${task.id}`}
                          className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-800"
                        >
                          Ver detalles
                        </Link>
                      </div>
                      <ReviewActions submissionId={submission.id} />
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
