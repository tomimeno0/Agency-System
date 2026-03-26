import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { TaskEditForm } from "./task-edit-form";

export default async function EditTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role === Role.EDITOR) redirect("/dashboard/tasks");

  const { taskId } = await params;
  const [task, clients, editors] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        description: true,
        instructions: true,
        clientId: true,
        directEditorId: true,
        deadlineAt: true,
        priority: true,
        assignmentMode: true,
      },
    }),
    prisma.client.findMany({
      select: { id: true, name: true, brandName: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.user.findMany({
      where: { role: Role.EDITOR },
      select: { id: true, displayName: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ]);
  if (!task) notFound();

  return (
    <main>
      <div className="mb-4">
        <Link href={`/dashboard/tasks/${task.id}`} className="text-sm text-zinc-300 underline hover:text-white">
          Volver al detalle
        </Link>
      </div>
      <h1 className="mb-4 text-2xl font-semibold">Editar task</h1>
      <TaskEditForm
        task={task}
        clients={clients.map((client) => ({ id: client.id, name: client.brandName ?? client.name }))}
        editors={editors.map((editor) => ({
          id: editor.id,
          name: editor.displayName,
          status: editor.status,
        }))}
      />
    </main>
  );
}
