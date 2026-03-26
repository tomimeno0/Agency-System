"use client";

import { TaskState } from "@prisma/client";
import Link from "next/link";
import { useState } from "react";
import { ArchiveTaskButton } from "./archive-task-button";
import { DeleteTaskButton } from "./delete-task-button";

type Props = {
  taskId: string;
  currentState: TaskState;
  canManage: boolean;
  canDelete: boolean;
  canArchive: boolean;
};

const stateOptions: Array<{ value: TaskState; label: string }> = [
  { value: TaskState.DRAFT, label: "Borrador" },
  { value: TaskState.PENDING_ASSIGNMENT, label: "Pendiente de asignacion" },
  { value: TaskState.OFFERED, label: "Esperando aceptacion" },
  { value: TaskState.ACCEPTED, label: "Aceptada" },
  { value: TaskState.IN_EDITING, label: "En edicion" },
  { value: TaskState.UPLOADED, label: "Subida" },
  { value: TaskState.IN_REVIEW, label: "En revision" },
  { value: TaskState.NEEDS_CORRECTION, label: "Requiere correccion" },
  { value: TaskState.APPROVED, label: "Aprobada" },
  { value: TaskState.DELIVERED, label: "Entregada" },
  { value: TaskState.CLOSED, label: "Cerrada" },
  { value: TaskState.CANCELLED, label: "Cancelada" },
];

export function TaskRowActions({ taskId, currentState, canManage, canDelete, canArchive }: Props) {
  const [toState, setToState] = useState<TaskState>(currentState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeState() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toState }),
      });
      if (!response.ok) {
        setError("No se pudo cambiar el estado.");
        return;
      }
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-[380px] space-y-2.5">
      <div className="flex flex-wrap gap-2.5">
        <Link
          href={`/dashboard/tasks/${taskId}`}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
        >
          Ver detalle
        </Link>
        {canManage ? (
          <Link
            href={`/dashboard/tasks/${taskId}/edit`}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            Editar
          </Link>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex items-center gap-2">
          <select
            value={toState}
            onChange={(event) => setToState(event.target.value as TaskState)}
            className="h-9 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-2.5 text-sm"
            aria-label="Cambiar estado"
          >
            {stateOptions.map((state) => (
              <option key={state.value} value={state.value}>
                {state.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={changeState}
            disabled={loading}
            className="h-9 rounded-md border border-zinc-700 px-3 text-sm hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Guardando..." : "Aplicar"}
          </button>
        </div>
      ) : null}

      {canManage ? (
        <div className="flex items-center gap-2.5">
          {canArchive ? <ArchiveTaskButton taskId={taskId} /> : null}
          {canDelete ? <DeleteTaskButton taskId={taskId} /> : null}
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
