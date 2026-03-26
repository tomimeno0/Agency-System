"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  workerId: string;
  canManage: boolean;
  canDelete: boolean;
  currentStatus: "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE" | "LOCKED";
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    authorName: string;
  }>;
  overdueCount: number;
};

export function WorkerProfileActions({
  workerId,
  canManage,
  canDelete,
  currentStatus,
  notes,
  overdueCount,
}: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [noteText, setNoteText] = useState("");
  const [localNotes, setLocalNotes] = useState(notes);
  const [loading, setLoading] = useState<"status" | "note" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(next: "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE" | "LOCKED") {
    setLoading("status");
    setError(null);
    const response = await fetch(`/api/users/${workerId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(null);
    if (!response.ok) {
      setError("No se pudo actualizar el estado.");
      return;
    }
    setStatus(next);
  }

  async function saveNote() {
    if (!noteText.trim()) return;
    setLoading("note");
    setError(null);
    const response = await fetch(`/api/workers/${workerId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteText.trim() }),
    });
    setLoading(null);
    if (!response.ok) {
      setError("No se pudo guardar la nota.");
      return;
    }
    const payload = (await response.json()) as {
      data: {
        id: string;
        content: string;
        createdAt: string;
        author: { displayName: string };
      };
    };
    setLocalNotes((prev) => [
      {
        id: payload.data.id,
        content: payload.data.content,
        createdAt: payload.data.createdAt,
        authorName: payload.data.author.displayName,
      },
      ...prev,
    ]);
    setNoteText("");
  }

  async function deleteAccount() {
    if (!confirm("Eliminar esta cuenta?")) return;
    setLoading("delete");
    setError(null);
    const response = await fetch(`/api/users/${workerId}`, { method: "DELETE" });
    setLoading(null);
    if (!response.ok) {
      setError("No se pudo eliminar la cuenta.");
      return;
    }
    window.location.href = "/dashboard/workers";
  }

  return (
    <aside className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Acciones administrativas</h2>
        <div className="space-y-2 text-sm">
          <Link href={`/dashboard/tasks/new?editorId=${workerId}`} className="block underline hover:text-white">
            Asignar tarea manualmente
          </Link>
          <Link href={`/dashboard/tasks?editor=${workerId}`} className="block underline hover:text-white">
            Ver historial de tareas
          </Link>
          <Link href={`/dashboard/tasks?editor=${workerId}&overdue=1`} className="block underline hover:text-white">
            Reasignar tareas atrasadas ({overdueCount})
          </Link>
        </div>

        {canManage ? (
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => updateStatus("LOCKED")}
              disabled={loading !== null || status === "LOCKED"}
              className="rounded-md border border-red-700 px-3 py-2 text-sm text-red-300 hover:bg-red-950/30 disabled:opacity-60"
            >
              Bloquear cuenta
            </button>
            <button
              type="button"
              onClick={() => updateStatus("ACTIVE")}
              disabled={loading !== null || status === "ACTIVE"}
              className="rounded-md border border-emerald-700 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-60"
            >
              Desbloquear / activar
            </button>
            <button
              type="button"
              onClick={() => updateStatus("INACTIVE")}
              disabled={loading !== null || status === "INACTIVE"}
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
            >
              Marcar inactivo
            </button>
            {canDelete ? (
              <button
                type="button"
                onClick={deleteAccount}
                disabled={loading !== null}
                className="rounded-md border border-red-700 px-3 py-2 text-sm text-red-300 hover:bg-red-950/30 disabled:opacity-60"
              >
                {loading === "delete" ? "Eliminando..." : "Eliminar cuenta"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Notas internas</h2>
        {canManage ? (
          <div className="mb-3">
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
              placeholder="Agregar nota interna"
            />
            <button
              type="button"
              onClick={saveNote}
              disabled={loading !== null || !noteText.trim()}
              className="mt-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
            >
              {loading === "note" ? "Guardando..." : "Guardar nota"}
            </button>
          </div>
        ) : null}

        {localNotes.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin notas internas.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {localNotes.map((note) => (
              <li key={note.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                <p>{note.content}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {new Date(note.createdAt).toLocaleString("es-AR")} · {note.authorName}
                </p>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </div>
    </aside>
  );
}
