"use client";

import { AssignmentStatus, TaskState, UserStatus } from "@prisma/client";
import { useMemo, useState } from "react";

type Props = {
  taskId: string;
  currentState: TaskState;
  tab?: string;
  isManager: boolean;
  editors: Array<{ id: string; displayName: string; status: UserStatus }>;
  assignments: Array<{
    id: string;
    editorId: string;
    editorName: string;
    status: AssignmentStatus;
    assignedAt: string;
    acceptedAt: string | null;
  }>;
  availableStates: TaskState[];
};

export function TaskDetailPanel({
  taskId,
  currentState,
  tab,
  isManager,
  editors,
  assignments,
  availableStates,
}: Props) {
  const [editorId, setEditorId] = useState("");
  const [toState, setToState] = useState<TaskState>(currentState);
  const [loading, setLoading] = useState<"assign" | "state" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sortedAssignments = useMemo(
    () =>
      [...assignments].sort(
        (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
      ),
    [assignments],
  );

  async function assignNow() {
    if (!editorId) return;
    setLoading("assign");
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/tasks/${taskId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        editorId,
        percentageOfTask: 100,
      }),
    });
    setLoading(null);
    if (!response.ok) {
      setError("No se pudo reasignar.");
      return;
    }
    setMessage("Task reasignada.");
    window.location.reload();
  }

  async function changeState() {
    setLoading("state");
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/tasks/${taskId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toState }),
    });
    setLoading(null);
    if (!response.ok) {
      setError("No se pudo actualizar el estado.");
      return;
    }
    setMessage("Estado actualizado.");
    window.location.reload();
  }

  return (
    <aside className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Asignaciones</h2>
        {sortedAssignments.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin asignaciones.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {sortedAssignments.map((assignment) => (
              <li key={assignment.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                <p>{assignment.editorName}</p>
                <p className="text-xs text-zinc-400">
                  {assignment.status} · {new Date(assignment.assignedAt).toLocaleString("es-AR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isManager ? (
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="mb-3 text-lg font-semibold">Acciones rapidas</h2>
          <div className="space-y-3">
            <div id="asignacion">
              <label className="mb-1 block text-xs text-zinc-400">Reasignar</label>
              <select
                value={editorId}
                onChange={(event) => setEditorId(event.target.value)}
                className={`w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm ${
                  tab === "asignacion" ? "ring-1 ring-blue-500" : ""
                }`}
              >
                <option value="">Seleccionar editor</option>
                {editors.map((editor) => (
                  <option key={editor.id} value={editor.id}>
                    {editor.displayName} ({editor.status})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={assignNow}
                disabled={!editorId || loading !== null}
                className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
              >
                {loading === "assign" ? "Reasignando..." : "Reasignar"}
              </button>
            </div>

            <div id="estado">
              <label className="mb-1 block text-xs text-zinc-400">Cambiar estado</label>
              <select
                value={toState}
                onChange={(event) => setToState(event.target.value as TaskState)}
                className={`w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm ${
                  tab === "estado" ? "ring-1 ring-blue-500" : ""
                }`}
              >
                {availableStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={changeState}
                disabled={loading !== null}
                className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
              >
                {loading === "state" ? "Guardando..." : "Guardar estado"}
              </button>
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
          {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
        </div>
      ) : null}
    </aside>
  );
}
