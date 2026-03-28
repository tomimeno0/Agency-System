import { FinancialMovementStatus, PaymentStatus, Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";

function toHumanPaymentStatus(status: PaymentStatus): "Pagado" | "Pendiente" {
  if (status === PaymentStatus.PAID) return "Pagado";
  return "Pendiente";
}

function statusBadge(status: "Pagado" | "Pendiente"): string {
  if (status === "Pagado") return "border border-emerald-700 bg-emerald-950/20 text-emerald-200";
  return "border border-amber-700 bg-amber-950/20 text-amber-200";
}

export default async function EarningsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.EDITOR) redirect("/dashboard");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [earnings, manualMovements] = await Promise.all([
    prisma.editorEarning.findMany({
      where: { editorId: session.user.id },
      include: {
        taskAssignment: {
          select: {
            task: {
              select: {
                title: true,
                client: { select: { name: true, brandName: true } },
              },
            },
          },
        },
      },
      orderBy: { calculatedAt: "desc" },
      take: 500,
    }),
    prisma.financialMovement.findMany({
      where: {
        editorId: session.user.id,
        status: { not: FinancialMovementStatus.CANCELLED },
      },
      select: {
        id: true,
        amount: true,
        status: true,
        description: true,
        occurredAt: true,
        task: {
          select: {
            title: true,
            client: { select: { name: true, brandName: true } },
          },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 500,
    }),
  ]);

  const validEarnings = earnings.filter((item) => item.status !== PaymentStatus.CANCELLED);
  const totalFromEarnings = validEarnings.reduce((sum, item) => sum + Number(item.editorNetAmount), 0);
  const monthFromEarnings = validEarnings
    .filter((item) => item.calculatedAt >= monthStart)
    .reduce((sum, item) => sum + Number(item.editorNetAmount), 0);
  const totalFromManual = manualMovements.reduce((sum, item) => sum + Number(item.amount), 0);
  const monthFromManual = manualMovements
    .filter((item) => item.occurredAt >= monthStart)
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const totalEarned = totalFromEarnings + totalFromManual;
  const monthEarned = monthFromEarnings + monthFromManual;

  const rows = [
    ...validEarnings.map((earning) => {
      const clientName =
        earning.taskAssignment.task.client?.brandName ??
        earning.taskAssignment.task.client?.name ??
        "-";
      return {
        id: `earning-${earning.id}`,
        taskTitle: earning.taskAssignment.task.title,
        clientName,
        amount: Number(earning.editorNetAmount),
        status: toHumanPaymentStatus(earning.status),
        createdAt: earning.calculatedAt,
      };
    }),
    ...manualMovements.map((movement) => {
      const clientName = movement.task?.client?.brandName ?? movement.task?.client?.name ?? "-";
      const movementStatus = movement.status === FinancialMovementStatus.PENDING ? "Pendiente" : "Pagado";
      return {
        id: `movement-${movement.id}`,
        taskTitle: movement.task?.title ?? movement.description,
        clientName,
        amount: Number(movement.amount),
        status: movementStatus as "Pagado" | "Pendiente",
        createdAt: movement.occurredAt,
      };
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-3xl font-semibold">Mis ingresos</h1>
        <p className="text-base text-zinc-400">Tu resumen financiero operativo.</p>
      </header>

      <section className="mb-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <p className="text-sm text-zinc-400">Total ganado</p>
          <p className="mt-1 text-3xl font-semibold">${totalEarned.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <p className="text-sm text-zinc-400">Ingresos del mes</p>
          <p className="mt-1 text-3xl font-semibold">${monthEarned.toFixed(2)}</p>
        </div>
      </section>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111827]">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No hay ingresos registrados todavia.</p>
        ) : (
          <table className="w-full text-left text-base">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-4 font-medium">Tarea</th>
                <th className="px-4 py-4 font-medium">Cliente</th>
                <th className="px-4 py-4 font-medium">Monto</th>
                <th className="px-4 py-4 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                return (
                  <tr key={row.id} className="border-b border-zinc-800">
                    <td className="px-4 py-4">{row.taskTitle}</td>
                    <td className="px-4 py-4">{row.clientName}</td>
                    <td className="px-4 py-4">${row.amount.toFixed(2)}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-sm ${statusBadge(row.status)}`}>
                        {row.status}
                      </span>
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
