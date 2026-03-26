"use client";

import { AssignmentMode, TaskPriority, TaskState } from "@prisma/client";
import { useMemo, useState } from "react";

type ClientOption = {
  id: string;
  name: string;
  brandName: string | null;
};

type EditorOption = {
  id: string;
  displayName: string;
};

type CreatedTask = {
  id: string;
  title: string;
};

export function TaskCreator({
  clients,
  editors,
  initialEditorId,
}: {
  clients: ClientOption[];
  editors: EditorOption[];
  initialEditorId?: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [clientId, setClientId] = useState("");
  const [editorId, setEditorId] = useState(initialEditorId ?? "");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>(AssignmentMode.MANUAL);
  const [totalVideos, setTotalVideos] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasDirectEditor = useMemo(() => Boolean(editorId), [editorId]);

  async function createTask(): Promise<CreatedTask> {
    const initialState = hasDirectEditor ? TaskState.OFFERED : TaskState.PENDING_ASSIGNMENT;

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || undefined,
        instructions: instructions || undefined,
        clientId: clientId || undefined,
        directEditorId: editorId || undefined,
        assignmentMode,
        assignedMode: assignmentMode === AssignmentMode.AUTOMATIC ? "offered" : "manual",
        state: initialState,
        priority,
        deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : undefined,
        totalVideos: totalVideos ? Number(totalVideos) : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error("No se pudo crear la task.");
    }

    const payload = (await response.json()) as { data: CreatedTask };
    return payload.data;
  }

  async function uploadFile(taskId: string, file: File) {
    const uploadUrlResponse = await fetch("/api/files/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    });
    if (!uploadUrlResponse.ok) {
      throw new Error(`No se pudo generar URL de subida para ${file.name}.`);
    }

    const uploadPayload = (await uploadUrlResponse.json()) as {
      data: { storageKey: string; uploadUrl: string };
    };

    const putResponse = await fetch(uploadPayload.data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putResponse.ok) {
      throw new Error(
        `No se pudo subir ${file.name}. Si no usas Cloudflare, configura STORAGE_PROVIDER=local en .env.`,
      );
    }

    const finalizeResponse = await fetch("/api/files/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId,
        storageKey: uploadPayload.data.storageKey,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    });
    if (!finalizeResponse.ok) {
      throw new Error(`No se pudo registrar el archivo ${file.name}.`);
    }
  }

  async function onSubmit() {
    setError(null);
    setMessage(null);

    if (!title.trim()) {
      setError("El titulo es obligatorio.");
      return;
    }
    if (!deadlineAt) {
      setError("El deadline es obligatorio para operar tareas.");
      return;
    }

    setLoading(true);
    try {
      const createdTask = await createTask();
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          await uploadFile(createdTask.id, file);
        }
      }
      setMessage(`Task creada: ${createdTask.title}`);
      setTitle("");
      setDescription("");
      setInstructions("");
      setClientId("");
      setEditorId("");
      setDeadlineAt("");
      setPriority(TaskPriority.MEDIUM);
      setTotalVideos("");
      setFiles(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error creando la task.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Crear task</h1>
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
                {client.brandName ?? client.name}
              </option>
            ))}
          </select>

          <select
            value={editorId}
            onChange={(event) => setEditorId(event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          >
            <option value="">Sin editor preasignado</option>
            {editors.map((editor) => (
              <option key={editor.id} value={editor.id}>
                {editor.displayName}
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
            <option value={AssignmentMode.MANUAL}>Asignacion manual</option>
            <option value={AssignmentMode.AUTOMATIC}>Asignacion automatica</option>
          </select>

          <input
            value={totalVideos}
            onChange={(event) => setTotalVideos(event.target.value)}
            type="number"
            min={1}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Total videos (opcional)"
          />

          <input
            type="file"
            multiple
            onChange={(event) => setFiles(event.target.files)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm md:col-span-2"
          />
        </div>

        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-3 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          rows={3}
          placeholder="Descripcion breve"
        />
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          className="mt-3 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          rows={6}
          placeholder="Instrucciones detalladas"
        />

        <p className="mt-2 text-xs text-zinc-400">
          {hasDirectEditor
            ? "Se crea con editor preasignado y queda lista para confirmar o trabajar."
            : "Se crea sin editor y queda en asignacion pendiente."}
        </p>

        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="mt-3 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Creando..." : "Crear task"}
        </button>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
      </div>
    </main>
  );
}
