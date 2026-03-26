import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { TaskCreator } from "./task-creator";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewTaskPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role === Role.EDITOR) {
    redirect("/dashboard/tasks");
  }

  const [clients, editors] = await Promise.all([
    prisma.client.findMany({
      select: { id: true, name: true, brandName: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: { role: Role.EDITOR, status: "ACTIVE" },
      select: { id: true, displayName: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const query = await searchParams;
  const initialEditorId = Array.isArray(query.editorId) ? query.editorId[0] : query.editorId;

  return <TaskCreator clients={clients} editors={editors} initialEditorId={initialEditorId ?? ""} />;
}
