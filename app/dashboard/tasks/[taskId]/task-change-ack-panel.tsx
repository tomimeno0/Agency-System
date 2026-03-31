"use client";

import { useState } from "react";

type ChangeItem = {
  id: string;
  createdAt: string;
  changedFields: string[];
};

export function TaskChangeAckPanel({
  taskId,
  pendingChanges,
}: {
  taskId: string;
  pendingChanges: ChangeItem[];
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pendingChanges.length === 0) return null;

  async function ack(changeLogId: string) {
    setError(null);
    setLoadingId(changeLogId);
    const response = await fetch(`/api/tasks/${taskId}/changes/${changeLogId}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    setLoadingId(null);
    if (!response.ok) {
      setError("No se pudo confirmar lectura de cambios.");
      return;
    }
    window.location.reload();
  }

  return (
    <div className="rounded-xl border border-amber-700 bg-amber-950/20 p-4">
      <h2 className="mb-2 text-lg font-semibold text-amber-100">Cambios por confirmar</h2>
      <p className="mb-3 text-sm text-amber-200">
        El owner/admin editó esta tarea. Confirma lectura para cerrar el cambio.
      </p>
      <ul className="space-y-2">
        {pendingChanges.map((change) => (
          <li key={change.id} className="rounded-md border border-amber-700/60 bg-zinc-900 px-3 py-2 text-sm">
            <p className="font-medium">Campos: {change.changedFields.join(", ")}</p>
            <p className="text-xs text-zinc-400">{new Date(change.createdAt).toLocaleString("es-AR")}</p>
            <button
              type="button"
              onClick={() => ack(change.id)}
              disabled={loadingId !== null}
              className="mt-2 rounded-md border border-amber-700 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-900/30 disabled:opacity-60"
            >
              {loadingId === change.id ? "Confirmando..." : "Confirmar cambios leidos"}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

