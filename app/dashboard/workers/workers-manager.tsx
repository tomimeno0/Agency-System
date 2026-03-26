"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type WorkerRow = {
  id: string;
  displayName: string;
  email: string;
  createdAt: string;
  role: string;
  accountStatus: "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE" | "LOCKED";
  onlineStatus: "ONLINE" | "OFFLINE";
  workloadCount: number;
  workloadTag: "Libre" | "Ocupado" | "Saturado" | string;
  acceptanceRate: number;
  failedDeadlines: number;
  completedTasks: number;
  avgDeliveryHours: number | null;
};

function statusLabel(status: WorkerRow["accountStatus"]): string {
  if (status === "ACTIVE") return "Activo";
  if (status === "PENDING_APPROVAL") return "Pendiente";
  if (status === "INACTIVE") return "Inactivo";
  return "Bloqueado";
}

function statusClass(status: WorkerRow["accountStatus"]): string {
  if (status === "ACTIVE") return "border-emerald-700 bg-emerald-950/20 text-emerald-200";
  if (status === "PENDING_APPROVAL") return "border-amber-700 bg-amber-950/20 text-amber-200";
  if (status === "LOCKED") return "border-red-700 bg-red-950/20 text-red-200";
  return "border-zinc-600 bg-zinc-900 text-zinc-200";
}

function loadClass(tag: string): string {
  if (tag === "Saturado") return "border-red-700 bg-red-950/20 text-red-200";
  if (tag === "Ocupado") return "border-amber-700 bg-amber-950/20 text-amber-200";
  return "border-emerald-700 bg-emerald-950/20 text-emerald-200";
}

export function WorkersManager({
  initialWorkers,
  canManage,
  canDelete,
}: {
  initialWorkers: WorkerRow[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const [workers, setWorkers] = useState(initialWorkers);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todos" | "riesgo" | "libres" | "saturados">("todos");

  const filtered = useMemo(() => {
    if (filter === "riesgo") return workers.filter((worker) => worker.failedDeadlines > 0);
    if (filter === "libres") return workers.filter((worker) => worker.workloadTag === "Libre");
    if (filter === "saturados") return workers.filter((worker) => worker.workloadTag === "Saturado");
    return workers;
  }, [workers, filter]);

  async function updateStatus(userId: string, status: WorkerRow["accountStatus"]) {
    setLoadingId(userId);
    const response = await fetch(`/api/users/${userId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoadingId(null);
    if (!response.ok) return;
    setWorkers((prev) =>
      prev.map((worker) => (worker.id === userId ? { ...worker, accountStatus: status } : worker)),
    );
  }

  async function deleteWorker(userId: string) {
    if (!confirm("Eliminar esta cuenta?")) return;
    setLoadingId(userId);
    const response = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    setLoadingId(null);
    if (!response.ok) return;
    setWorkers((prev) => prev.filter((worker) => worker.id !== userId));
  }

  return (
    <main>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Workers</h1>
          <p className="text-sm text-zinc-400">Equipo de edicion y capacidad operativa</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { key: "todos", label: "Todos" },
            { key: "riesgo", label: "Con riesgo" },
            { key: "libres", label: "Libres" },
            { key: "saturados", label: "Saturados" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key as "todos" | "riesgo" | "libres" | "saturados")}
              className={`rounded-md border px-3 py-1.5 ${
                filter === item.key
                  ? "border-white bg-white text-black"
                  : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111827]">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No hay workers para este filtro.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Fecha alta</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado cuenta</th>
                <th className="px-4 py-3 font-medium">Estado online</th>
                <th className="px-4 py-3 font-medium">Workload</th>
                <th className="px-4 py-3 font-medium">Acceptance rate</th>
                <th className="px-4 py-3 font-medium">Deadlines fallidos</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((worker) => (
                <tr key={worker.id} className="border-b border-zinc-800 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/workers/${worker.id}`} className="underline hover:text-white">
                      {worker.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{worker.email}</td>
                  <td className="px-4 py-3">{new Date(worker.createdAt).toLocaleDateString("es-AR")}</td>
                  <td className="px-4 py-3">{worker.role.toLowerCase()}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(worker.accountStatus)}`}>
                      {statusLabel(worker.accountStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        worker.onlineStatus === "ONLINE"
                          ? "border border-emerald-700 bg-emerald-950/20 text-emerald-200"
                          : "border border-zinc-700 bg-zinc-900 text-zinc-300"
                      }`}
                    >
                      {worker.onlineStatus === "ONLINE" ? "Online ahora" : "Offline"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${loadClass(worker.workloadTag)}`}>
                      {worker.workloadTag} ({worker.workloadCount})
                    </span>
                  </td>
                  <td className="px-4 py-3">{Math.round((worker.acceptanceRate ?? 0) * 100)}%</td>
                  <td className="px-4 py-3">
                    {worker.failedDeadlines}
                    <span className="block text-xs text-zinc-500">
                      avg entrega: {worker.avgDeliveryHours ?? "-"}h
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/dashboard/workers/${worker.id}`} className="text-xs underline hover:text-white">
                        Ver perfil
                      </Link>
                      {canManage && worker.accountStatus === "PENDING_APPROVAL" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => updateStatus(worker.id, "ACTIVE")}
                            disabled={loadingId === worker.id}
                            className="text-xs underline text-emerald-300 disabled:opacity-60"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(worker.id, "INACTIVE")}
                            disabled={loadingId === worker.id}
                            className="text-xs underline text-red-300 disabled:opacity-60"
                          >
                            Rechazar
                          </button>
                        </>
                      ) : null}
                      {canManage && worker.accountStatus === "ACTIVE" ? (
                        <button
                          type="button"
                          onClick={() => updateStatus(worker.id, "LOCKED")}
                          disabled={loadingId === worker.id}
                          className="text-xs underline text-red-300 disabled:opacity-60"
                        >
                          Bloquear
                        </button>
                      ) : null}
                      {canManage &&
                      (worker.accountStatus === "LOCKED" || worker.accountStatus === "INACTIVE") ? (
                        <button
                          type="button"
                          onClick={() => updateStatus(worker.id, "ACTIVE")}
                          disabled={loadingId === worker.id}
                          className="text-xs underline text-emerald-300 disabled:opacity-60"
                        >
                          Activar
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => deleteWorker(worker.id)}
                          disabled={loadingId === worker.id}
                          className="text-xs underline text-red-300 disabled:opacity-60"
                        >
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
