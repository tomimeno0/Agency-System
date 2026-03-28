import { Role, ReviewDecision } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { FileDownloadButton } from "@/app/dashboard/_components/file-download-button";
import { prisma } from "@/lib/db";

function decisionText(decision: ReviewDecision): string {
  return decision === ReviewDecision.APPROVED ? "Aprobado" : "Correccion solicitada";
}

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.EDITOR) redirect("/dashboard");

  const { submissionId } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      taskAssignment: {
        include: {
          task: {
            select: {
              id: true,
              title: true,
              client: {
                select: { id: true, name: true, brandName: true },
              },
            },
          },
        },
      },
      file: true,
      reviews: {
        include: {
          reviewedBy: { select: { displayName: true } },
        },
        orderBy: { reviewedAt: "desc" },
      },
    },
  });

  if (!submission) notFound();
  if (submission.taskAssignment.editorId !== session.user.id) redirect("/dashboard/submissions");

  const clientName =
    submission.taskAssignment.task.client?.brandName ??
    submission.taskAssignment.task.client?.name ??
    "-";

  return (
    <main>
      <div className="mb-4">
        <Link href="/dashboard/submissions" className="text-sm text-zinc-300 underline hover:text-white">
          Volver a entregas
        </Link>
      </div>

      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Entrega</h1>
        <p className="text-sm text-zinc-400">
          {submission.taskAssignment.task.title} | {clientName}
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <h2 className="mb-2 text-lg font-semibold">Detalle</h2>
            <p className="text-sm text-zinc-300">Fecha: {submission.submittedAt.toLocaleString("es-AR")}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
              Comentario: {submission.notes || "Sin comentario"}
            </p>
            <div className="mt-3">
              <Link
                href={`/dashboard/tasks/${submission.taskAssignment.task.id}`}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
              >
                Ir a la tarea
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <h2 className="mb-3 text-lg font-semibold">Feedback</h2>
            {submission.reviews.length === 0 ? (
              <p className="text-sm text-zinc-400">Aun no hay revision para esta entrega.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {submission.reviews.map((review) => (
                  <li key={review.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                    <p className="font-medium">{decisionText(review.decision)}</p>
                    <p className="text-xs text-zinc-400">
                      {review.reviewedBy.displayName} | {review.reviewedAt.toLocaleString("es-AR")}
                    </p>
                    {review.comments ? <p className="mt-1 text-zinc-200">{review.comments}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <h2 className="mb-3 text-lg font-semibold">Archivo principal</h2>
            {submission.file ? (
              <div className="space-y-2">
                <p className="text-sm text-zinc-300">{submission.file.originalName}</p>
                <p className="text-xs text-zinc-400">{Math.round(submission.file.sizeBytes / 1024)} KB</p>
                <FileDownloadButton fileId={submission.file.id} />
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Sin archivo asociado.</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
