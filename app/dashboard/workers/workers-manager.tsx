"use client";

import { useState } from "react";

type WorkerRow = {
  id: string;
  displayName: string;
  email: string;
  createdAt: string;
  role?: string;
  status?: "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE" | "LOCKED";
  workloadScore?: number;
  acceptanceRate?: number;
};

export function WorkersManager({
  initialWorkers,
  canManage,
}: {
  initialWorkers: WorkerRow[];
  canManage: boolean;
}) {
  const [workers, setWorkers] = useState(initialWorkers);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function updateStatus(userId: string, status: WorkerRow["status"]) {
    if (!status) return;
    setLoadingId(userId);

    const response = await fetch(`/api/users/${userId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    setLoadingId(null);
    if (!response.ok) return;

    setWorkers((prev) =>
      prev.map((worker) => (worker.id === userId ? { ...worker, status } : worker)),
    );
  }

  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Workers</h1>
      <div className="overflow-hidden rounded-xl bg-[#111827]">
        {workers.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No data yet</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Workload</th>
                <th className="px-4 py-3 font-medium">Acceptance Rate</th>
                {canManage ? <th className="px-4 py-3 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.id} className="border-b border-zinc-800">
                  <td className="px-4 py-3">{worker.displayName}</td>
                  <td className="px-4 py-3">{worker.email}</td>
                  <td className="px-4 py-3">{new Date(worker.createdAt).toLocaleDateString("es-AR")}</td>
                  <td className="px-4 py-3">{(worker.role ?? "EDITOR").toLowerCase()}</td>
                  <td className="px-4 py-3">{worker.status ?? "-"}</td>
                  <td className="px-4 py-3">{worker.workloadScore ?? "-"}</td>
                  <td className="px-4 py-3">
                    {typeof worker.acceptanceRate === "number"
                      ? `${Math.round(worker.acceptanceRate * 100)}%`
                      : "-"}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      {worker.status === "PENDING_APPROVAL" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateStatus(worker.id, "ACTIVE")}
                            disabled={loadingId === worker.id}
                            className="rounded-md border border-emerald-700 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-60"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(worker.id, "INACTIVE")}
                            disabled={loadingId === worker.id}
                            className="rounded-md border border-red-700 px-2 py-1 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-60"
                          >
                            Rechazar
                          </button>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
