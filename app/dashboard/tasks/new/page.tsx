import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { TaskCreator } from "./task-creator";

export default async function NewTaskPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== Role.OWNER) {
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

  return <TaskCreator clients={clients} editors={editors} />;
}
