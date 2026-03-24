"use client";

import { useState } from "react";

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
}: {
  clients: ClientOption[];
  editors: EditorOption[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [clientId, setClientId] = useState("");
  const [editorId, setEditorId] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createTask(): Promise<CreatedTask> {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || undefined,
        instructions: instructions || undefined,
        clientId: clientId || undefined,
        directEditorId: editorId || undefined,
        assignmentMode: "MANUAL",
        assignedMode: "manual",
      }),
    });

    if (!response.ok) {
      throw new Error("No se pudo crear la task");
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
      throw new Error(`No se pudo generar URL de subida para ${file.name}`);
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
      throw new Error(`No se pudo subir el archivo ${file.name}`);
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
      throw new Error(`No se pudo finalizar el archivo ${file.name}`);
    }
  }

  async function onSubmit() {
    setError(null);
    setMessage(null);
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
      setFiles(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error creando la task");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Crear Task</h1>
      <div className="rounded-xl bg-[#111827] p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Titulo de la task"
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
            type="file"
            multiple
            onChange={(event) => setFiles(event.target.files)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          />
        </div>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-3 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          rows={3}
          placeholder="Descripcion"
        />
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          className="mt-3 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          rows={6}
          placeholder="Instrucciones detalladas"
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || !title.trim()}
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
