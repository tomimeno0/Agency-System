"use client";

import { useState } from "react";

type Props = {
  taskId: string;
  assignmentId: string | null;
  pendingAcceptance: boolean;
  canDeliver: boolean;
  mustAcknowledgeChanges: boolean;
};

export function EditorDeliveryPanel({
  taskId,
  assignmentId,
  pendingAcceptance,
  canDeliver,
  mustAcknowledgeChanges,
}: Props) {
  const [decisionLoading, setDecisionLoading] = useState<"accept" | "reject" | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function respond(decision: "accept" | "reject") {
    if (!assignmentId) return;
    setDecisionLoading(decision);
    setError(null);
    setMessage(null);

    const reason =
      decision === "reject" ? window.prompt("Motivo de rechazo (opcional):", "") ?? "" : undefined;

    const response = await fetch(`/api/assignments/${assignmentId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        reason: reason || undefined,
      }),
    });

    setDecisionLoading(null);
    if (!response.ok) {
      setError("No se pudo registrar la respuesta.");
      return;
    }

    window.location.reload();
  }

  async function uploadAndFinalize(file: File): Promise<string> {
    const uploadUrlResponse = await fetch("/api/files/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId,
        assignmentId: assignmentId ?? undefined,
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
      throw new Error(`No se pudo subir ${file.name}.`);
    }

    const finalizeResponse = await fetch("/api/files/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId,
        assignmentId: assignmentId ?? undefined,
        storageKey: uploadPayload.data.storageKey,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        isFinal: true,
      }),
    });
    if (!finalizeResponse.ok) {
      throw new Error(`No se pudo registrar ${file.name}.`);
    }

    const finalizePayload = (await finalizeResponse.json()) as { data?: { id?: string } };
    const fileId = finalizePayload.data?.id;
    if (!fileId) {
      throw new Error(`No se pudo obtener el id de archivo para ${file.name}.`);
    }

    return fileId;
  }

  async function submitDelivery() {
    if (!assignmentId) {
      setError("Esta tarea no tiene asignacion activa para tu cuenta.");
      return;
    }
    if (!canDeliver || mustAcknowledgeChanges) {
      setError("La tarea no esta en un estado entregable.");
      return;
    }
    if (!files || files.length === 0) {
      setError("Subi al menos un archivo.");
      return;
    }

    setDeliveryLoading(true);
    setError(null);
    setMessage(null);

    try {
      const uploadedIds: string[] = [];
      for (const file of Array.from(files)) {
        const fileId = await uploadAndFinalize(file);
        uploadedIds.push(fileId);
      }

      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskAssignmentId: assignmentId,
          fileId: uploadedIds[0],
          notes: comment.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("No se pudo registrar la entrega.");
      }

      setMessage("Entrega enviada para revision.");
      setFiles(null);
      setComment("");
      window.location.reload();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "No se pudo entregar.");
    } finally {
      setDeliveryLoading(false);
    }
  }

  return (
    <aside id="entrega" className="space-y-4">
      {pendingAcceptance ? (
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="mb-3 text-lg font-semibold">Responder oferta</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => respond("accept")}
              disabled={decisionLoading !== null}
              className="rounded-md border border-emerald-700 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-60"
            >
              {decisionLoading === "accept" ? "Aceptando..." : "Aceptar tarea"}
            </button>
            <button
              type="button"
              onClick={() => respond("reject")}
              disabled={decisionLoading !== null}
              className="rounded-md border border-red-700 px-3 py-2 text-sm text-red-300 hover:bg-red-950/30 disabled:opacity-60"
            >
              {decisionLoading === "reject" ? "Rechazando..." : "Rechazar tarea"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Entregar</h2>
        <input
          type="file"
          multiple
          onChange={(event) => setFiles(event.target.files)}
          className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
        />
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
          placeholder="Comentario de entrega (opcional)"
          className="mt-3 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={submitDelivery}
          disabled={deliveryLoading || !canDeliver || mustAcknowledgeChanges}
          className="mt-3 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
        >
          {deliveryLoading ? "Enviando..." : "Entregar"}
        </button>
        {mustAcknowledgeChanges ? (
          <p className="mt-2 text-xs text-amber-300">
            Debes confirmar lectura de los cambios recientes antes de volver a entregar.
          </p>
        ) : null}
        {!canDeliver && !mustAcknowledgeChanges ? (
          <p className="mt-2 text-xs text-zinc-400">
            Esta tarea solo se puede entregar cuando este en proceso o en correccion.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
      </div>
    </aside>
  );
}
