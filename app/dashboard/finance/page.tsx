import { PaymentStatus, Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { FinanceManager } from "./finance-manager";

export default async function FinancePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.OWNER) redirect("/dashboard");

  const [movements, clients, tasks, editors, pendingApprovals] = await Promise.all([
    prisma.financialMovement.findMany({
      include: {
        client: { select: { id: true, name: true, brandName: true } },
        task: { select: { id: true, title: true } },
        editor: { select: { id: true, displayName: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 2000,
    }),
    prisma.client.findMany({
      select: { id: true, name: true, brandName: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    prisma.task.findMany({
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    prisma.user.findMany({
      where: { role: Role.EDITOR },
      select: { id: true, displayName: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    prisma.editorEarning.count({ where: { status: PaymentStatus.PENDING_OWNER_APPROVAL } }),
  ]);

  return (
    <FinanceManager
      initialMovements={movements.map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        subtype: item.subtype,
        amount: Number(item.amount),
        currency: item.currency,
        occurredAt: item.occurredAt.toISOString(),
        description: item.description,
        method: item.method,
        notes: item.notes,
        clientId: item.clientId,
        clientName: item.client?.brandName ?? item.client?.name ?? null,
        taskId: item.taskId,
        taskTitle: item.task?.title ?? null,
        editorId: item.editorId,
        editorName: item.editor?.displayName ?? null,
      }))}
      clients={clients.map((client) => ({
        id: client.id,
        name: client.brandName ?? client.name,
      }))}
      tasks={tasks}
      editors={editors}
      pendingApprovals={pendingApprovals}
    />
  );
}
