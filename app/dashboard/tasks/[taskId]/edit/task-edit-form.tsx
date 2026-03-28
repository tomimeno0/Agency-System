"use client";

import { AssignmentMode, TaskPriority } from "@prisma/client";
import { useState } from "react";

type Props = {
  task: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    clientId: string | null;
    directEditorId: string | null;
    deadlineAt: Date | null;
    priority: TaskPriority;
    assignmentMode: AssignmentMode;
  };
  clients: Array<{ id: string; name: string }>;
  editors: Array<{ id: string; name: string; status: string }>;
};

function toLocalDateTime(value: Date | null): string {
  if (!value) return "";
  const offsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function TaskEditForm({ task, clients, editors }: Props) {
  const [title, setTitle] = useState(task.title);
  const [clientId, setClientId] = useState(task.clientId ?? "");
  const [editorId, setEditorId] = useState(task.directEditorId ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>(task.assignmentMode);
  const [deadlineAt, setDeadlineAt] = useState(toLocalDateTime(task.deadlineAt));
  const [description, setDescription] = useState(task.description ?? "");
  const [instructions, setInstructions] = useState(task.instructions ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        clientId: clientId || null,
        directEditorId: editorId || null,
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : null,
        priority,
        assignmentMode,
      }),
    });
    setLoading(false);

    if (!response.ok) {
      setError("No se pudo guardar la task.");
      return;
    }
    setMessage("Task actualizada.");
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          placeholder="Titulo"
        />
        <select
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
        >
          <option value="">Sin cliente</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <select
          value={editorId}
          onChange={(event) => setEditorId(event.target.value)}
          className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
        >
          <option value="">Sin editor</option>
          {editors.map((editor) => (
            <option key={editor.id} value={editor.id}>
              {editor.name} ({editor.status})
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={deadlineAt}
          onChange={(event) => setDeadlineAt(event.target.value)}
          className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
        />
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value as TaskPriority)}
          className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
        >
          <option value={TaskPriority.LOW}>Prioridad baja</option>
          <option value={TaskPriority.MEDIUM}>Prioridad media</option>
          <option value={TaskPriority.HIGH}>Prioridad alta</option>
          <option value={TaskPriority.URGENT}>Prioridad urgente</option>
        </select>
        <select
          value={assignmentMode}
          onChange={(event) => setAssignmentMode(event.target.value as AssignmentMode)}
          className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
        >
          <option value={AssignmentMode.AUTOMATIC}>Asignacion automatica</option>
          <option value={AssignmentMode.MANUAL}>Asignacion manual</option>
        </select>
      </div>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={3}
        className="mt-3 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
        placeholder="Descripcion"
      />
      <textarea
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        rows={6}
        className="mt-3 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
        placeholder="Instrucciones"
      />
      <button
        type="button"
        onClick={save}
        disabled={loading || !title.trim()}
        className="mt-3 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
      >
        {loading ? "Guardando..." : "Guardar cambios"}
      </button>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
    </div>
  );
}
