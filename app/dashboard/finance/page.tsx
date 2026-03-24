import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { fetchApiItems } from "@/app/dashboard/_lib/api";
import { authOptions } from "@/lib/auth/options";

type EarningRow = {
  id: string;
  editorNetAmount: string;
  agencyCommissionAmount: string;
  status: string;
  editor: {
    displayName: string | null;
  } | null;
  taskAssignment: {
    taskId: string;
    percentageOfTask: string;
  } | null;
};

export default async function FinancePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== Role.OWNER) {
    redirect("/dashboard");
  }

  const ledger = await fetchApiItems<EarningRow>("/api/finance");

  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Financial Manager</h1>
      <div className="overflow-hidden rounded-xl bg-[#111827]">
        {ledger.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No data yet</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Editor</th>
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Editor Net</th>
                <th className="px-4 py-3 font-medium">Agency Commission</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((item) => (
                <tr key={item.id} className="border-b border-zinc-800">
                  <td className="px-4 py-3">{item.editor?.displayName ?? "-"}</td>
                  <td className="px-4 py-3">{item.taskAssignment?.taskId ?? "-"}</td>
                  <td className="px-4 py-3">{item.editorNetAmount}</td>
                  <td className="px-4 py-3">{item.agencyCommissionAmount}</td>
                  <td className="px-4 py-3">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
