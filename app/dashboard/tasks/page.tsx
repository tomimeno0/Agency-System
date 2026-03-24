import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchApiItems } from "@/app/dashboard/_lib/api";
import { authOptions } from "@/lib/auth/options";

type TaskAssignmentRow = {
  status: string;
  editor?: {
    displayName?: string;
  } | null;
};

type TaskRow = {
  id: string;
  title: string;
  state: string;
  priority: string;
  assignmentFlowStatus: string;
  client: {
    name: string;
    brandName: string | null;
  } | null;
  directEditor: {
    displayName: string;
  } | null;
  assignments?: TaskAssignmentRow[];
};

function acceptedEditor(task: TaskRow): string {
  const accepted = task.assignments?.find((assignment) => assignment.status === "ACCEPTED");
  if (accepted?.editor?.displayName) return accepted.editor.displayName;
  return task.directEditor?.displayName ?? "-";
}

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const tasks = await fetchApiItems<TaskRow>("/api/tasks");
  const isOwner = session.user.role === Role.OWNER;

  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{isOwner ? "Tasks" : "Mis Tasks"}</h1>
        {isOwner ? (
          <Link
            href="/dashboard/tasks/new"
            className="rounded-md border border-zinc-700 bg-[#111827] px-3 py-2 text-sm hover:bg-zinc-800"
          >
            Crear task
          </Link>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl bg-[#111827]">
        {tasks.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No data yet</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Editor</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Assignment</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-zinc-800">
                  <td className="px-4 py-3">{task.title}</td>
                  <td className="px-4 py-3">{task.client?.brandName ?? task.client?.name ?? "-"}</td>
                  <td className="px-4 py-3">{acceptedEditor(task)}</td>
                  <td className="px-4 py-3">{task.state}</td>
                  <td className="px-4 py-3">{task.priority}</td>
                  <td className="px-4 py-3">{task.assignmentFlowStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
