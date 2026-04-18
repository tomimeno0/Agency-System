"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  taskId: string;
  assignmentId: string | null;
  pendingAcceptance: boolean;
  canDeliver: boolean;
  campaignPendingAcceptance?: boolean;
};

export function EditorTaskActions({
  taskId,
  assignmentId,
  pendingAcceptance,
  canDeliver,
  campaignPendingAcceptance = false,
}: Props) {
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(decision: "accept" | "reject") {
    if (!assignmentId) return;
    setLoading(decision);
    setError(null);

    const reason =
      decision === "reject"
        ? window.prompt("Motivo de rechazo (opcional):", "") ?? ""
        : undefined;

    const response = await fetch(`/api/assignments/${assignmentId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        reason: reason || undefined,
      }),
    });

    setLoading(null);
    if (!response.ok) {
      setError("No se pudo actualizar la respuesta.");
      return;
    }
    window.location.reload();
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {pendingAcceptance && assignmentId && !campaignPendingAcceptance ? (
          <>
            <button
              type="button"
              onClick={() => respond("accept")}
              disabled={loading !== null}
              className="rounded-md border border-emerald-700 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-60"
            >
              {loading === "accept" ? "Aceptando..." : "Aceptar"}
            </button>
            <button
              type="button"
              onClick={() => respond("reject")}
              disabled={loading !== null}
              className="rounded-md border border-red-700 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-60"
            >
              {loading === "reject" ? "Rechazando..." : "Rechazar"}
            </button>
          </>
        ) : null}
        <Link
          href={`/dashboard/tasks/${taskId}`}
          className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-800"
        >
          Ver detalle
        </Link>
        {canDeliver ? (
          <Link
            href={`/dashboard/tasks/${taskId}#entrega`}
            className="rounded-md border border-blue-700 px-2.5 py-1 text-xs text-blue-300 hover:bg-blue-950/30"
          >
            Entregar
          </Link>
        ) : null}
      </div>
      {campaignPendingAcceptance ? (
        <p className="text-xs text-zinc-400">Acepta o rechaza desde el bloque de campana.</p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
