import { AssignmentStatus, Role, TaskState } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { FileDownloadButton } from "@/app/dashboard/_components/file-download-button";
import { prisma } from "@/lib/db";
import {
  toHumanPriority,
  toHumanTaskHistoryComment,
  toHumanTaskStage,
  toHumanTaskState,
} from "@/lib/presentation/tasks";
import { EditorDeliveryPanel } from "./editor-delivery-panel";
import { TaskChangeAckPanel } from "./task-change-ack-panel";
import { TaskDetailPanel } from "./task-detail-panel";

function taskStateForEditor(taskState: TaskState, assignmentStatus?: AssignmentStatus) {
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

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const actor = session.user;
  const { taskId } = await params;

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
      changeLogs: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          changedBy: { select: { id: true, displayName: true } },
          acknowledgements: {
            select: { editorId: true, acknowledgedAt: true },
          },
        },
      },
      files: {
        where: {
          assignmentId: null,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });
  if (!task) notFound();

  const accessByAssignment = task.assignments.some(
    (assignment) =>
      assignment.editorId === actor.id &&
      (assignment.status === AssignmentStatus.ASSIGNED ||
        assignment.status === AssignmentStatus.ACCEPTED ||
        assignment.status === AssignmentStatus.COMPLETED),
  );
  const accessByDirectEditor = task.directEditorId === actor.id;
  if (actor.role === Role.EDITOR && !accessByAssignment && !accessByDirectEditor) {
    redirect("/dashboard/tasks");
  }

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

  const submissions = await prisma.submission.findMany({
    where: {
      taskAssignment: {
        taskId: task.id,
        ...(actor.role === Role.EDITOR ? { editorId: actor.id } : {}),
      },
    },
    include: {
      file: true,
      reviews: {
        include: {
          reviewedBy: { select: { id: true, displayName: true } },
        },
        orderBy: { reviewedAt: "desc" },
      },
      taskAssignment: {
        select: {
          id: true,
          editorId: true,
          assignedAt: true,
          acceptedAt: true,
          editor: { select: { displayName: true } },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
    take: 100,
  });

  if (actor.role === Role.EDITOR) {
    const ownAssignment =
      task.assignments.find(
        (assignment) =>
          assignment.editorId === actor.id &&
          (assignment.status === AssignmentStatus.ASSIGNED ||
            assignment.status === AssignmentStatus.ACCEPTED ||
            assignment.status === AssignmentStatus.COMPLETED),
      ) ?? null;
    const editorStatus = taskStateForEditor(task.state, ownAssignment?.status);
    const pendingAcceptance = ownAssignment?.status === AssignmentStatus.ASSIGNED;
    const canDeliver = editorStatus === "En proceso" || editorStatus === "Correccion";

    const reviewItems = submissions
      .flatMap((submission) =>
        submission.reviews.map((review) => ({
          id: review.id,
          decision: review.decision,
          comments: review.comments,
          reviewedAt: review.reviewedAt,
          reviewer: review.reviewedBy.displayName,
        })),
      )
      .sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime());

    const pendingAcks = task.changeLogs
      .filter(
        (change) =>
          change.requiresAck &&
          !change.acknowledgements.some((ack) => ack.editorId === actor.id),
      )
      .map((change) => ({
        id: change.id,
        createdAt: change.createdAt.toISOString(),
        changedFields: change.changedFields,
      }));

    return (
      <main>
        <div className="mb-4">
          <Link href="/dashboard/tasks" className="text-sm text-zinc-300 underline hover:text-white">
            Volver a mis tareas
          </Link>
        </div>
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{task.title}</h1>
            <p className="text-sm text-zinc-400">{task.client?.brandName ?? task.client?.name ?? "Sin cliente"}</p>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1">{editorStatus}</span>
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
            <TaskChangeAckPanel taskId={task.id} pendingChanges={pendingAcks} />

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
              <h2 className="mb-3 text-lg font-semibold">Archivos adjuntos</h2>
              {task.files.length === 0 ? (
                <p className="text-sm text-zinc-400">Sin archivos cargados.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {task.files.map((file) => (
                    <li key={file.id} className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                      <div>
                        <p>{file.originalName}</p>
                        <p className="text-xs text-zinc-400">
                          {Math.round(file.sizeBytes / 1024)} KB | v{file.version}
                        </p>
                      </div>
                      <FileDownloadButton fileId={file.id} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
              <h2 className="mb-3 text-lg font-semibold">Historial</h2>
              <ul className="space-y-2 text-sm">
                <li className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <p>Asignada</p>
                  <p className="text-xs text-zinc-400">
                    {ownAssignment?.assignedAt ? ownAssignment.assignedAt.toLocaleString("es-AR") : "Sin registro"}
                  </p>
                </li>
                <li className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <p>Aceptada</p>
                  <p className="text-xs text-zinc-400">
                    {ownAssignment?.acceptedAt ? ownAssignment.acceptedAt.toLocaleString("es-AR") : "Sin registro"}
                  </p>
                </li>
                <li className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <p>Ultima entrega</p>
                  <p className="text-xs text-zinc-400">
                    {submissions[0] ? submissions[0].submittedAt.toLocaleString("es-AR") : "Sin entregas"}
                  </p>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
              <h2 className="mb-3 text-lg font-semibold">Feedback</h2>
              {reviewItems.length === 0 ? (
                <p className="text-sm text-zinc-400">Aun no hay comentarios de revision.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {reviewItems.map((review) => (
                    <li key={review.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                      <p className="font-medium">
                        {review.decision === "APPROVED" ? "Aprobado" : "Correccion solicitada"}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {review.reviewer} | {review.reviewedAt.toLocaleString("es-AR")}
                      </p>
                      {review.comments ? <p className="mt-1 text-zinc-200">{review.comments}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <EditorDeliveryPanel
            taskId={task.id}
            assignmentId={ownAssignment?.id ?? null}
            pendingAcceptance={pendingAcceptance}
            canDeliver={canDeliver}
            mustAcknowledgeChanges={pendingAcks.length > 0}
          />
        </section>
      </main>
    );
  }

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
            {task.client?.brandName ?? task.client?.name ?? "Sin cliente"} | {editorName}
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
                      {toHumanTaskState(item.fromState)} {"->"} {toHumanTaskState(item.toState)}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {item.changedBy.displayName} | {item.changedAt.toLocaleString("es-AR")}
                    </p>
                    {item.comment ? (
                      <p className="mt-1 text-xs text-zinc-300">{toHumanTaskHistoryComment(item.comment)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <h2 className="mb-3 text-lg font-semibold">Cambios recientes</h2>
            {task.changeLogs.length === 0 ? (
              <p className="text-sm text-zinc-400">Sin cambios registrados.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {task.changeLogs.map((change) => {
                  const ackTotal = change.acknowledgements.length;
                  return (
                    <li key={change.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                      <p className="font-medium">
                        {change.changedBy.displayName} edito: {change.changedFields.join(", ")}
                      </p>
                      <p className="text-xs text-zinc-400">{change.createdAt.toLocaleString("es-AR")}</p>
                      <p className="mt-1 text-xs text-zinc-300">
                        ACK: {ackTotal} {change.requiresAck ? "(requerido)" : "(informativo)"}
                      </p>
                    </li>
                  );
                })}
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
                  <li key={file.id} className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                    <div>
                      <p>{file.originalName}</p>
                      <p className="text-xs text-zinc-400">
                        {Math.round(file.sizeBytes / 1024)} KB | v{file.version}
                      </p>
                    </div>
                    <FileDownloadButton fileId={file.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <TaskDetailPanel
          assignments={task.assignments.map((assignment) => ({
            id: assignment.id,
            editorId: assignment.editorId,
            editorName: assignment.editor.displayName,
            status: assignment.status,
            assignedAt: assignment.assignedAt.toISOString(),
            acceptedAt: assignment.acceptedAt ? assignment.acceptedAt.toISOString() : null,
          }))}
        />
      </section>
    </main>
  );
}
