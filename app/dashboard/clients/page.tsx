import { Role, TaskState } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { ClientsManager } from "./clients-manager";

export default async function ClientsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role === Role.EDITOR) redirect("/dashboard");

  const clients = await prisma.client.findMany({
    include: {
      tasks: {
        select: {
          id: true,
          state: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 400,
  });

  const items = clients.map((client) => {
    const activeTasks = client.tasks.filter(
      (task) =>
        task.state !== TaskState.APPROVED &&
        task.state !== TaskState.DELIVERED &&
        task.state !== TaskState.CLOSED &&
        task.state !== TaskState.CANCELLED,
    ).length;
    const lastActivity = client.tasks.length
      ? client.tasks.map((task) => task.updatedAt.getTime()).sort((a, b) => b - a)[0]
      : null;

    return {
      id: client.id,
      name: client.name,
      brandName: client.brandName,
      email: client.email,
      status: client.status,
      activeTasks,
      lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
      createdAt: client.createdAt.toISOString(),
    };
  });

  const canManage = session.user.role === Role.OWNER;
  return <ClientsManager initialClients={items} canManage={canManage} />;
}
