"use client";

import { useState } from "react";

type Props = {
  submissionId: string;
};

export function ReviewActions({ submissionId }: Props) {
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: "APPROVED" | "NEEDS_CORRECTION") {
    if (decision === "NEEDS_CORRECTION" && !comment.trim()) {
      setError("Para devolver la tarea, agrega una nota para el editor.");
      return;
    }

    setLoading(decision === "APPROVED" ? "approve" : "reject");
    setError(null);

    const response = await fetch(`/api/submissions/${submissionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        comments: comment.trim() || undefined,
      }),
    });

    setLoading(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(payload?.error?.message ?? "No se pudo guardar la revision.");
      return;
    }

    window.location.reload();
  }

  return (
    <div className="space-y-2">
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={2}
        placeholder="Nota para el editor (obligatoria si devolves)"
        className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-2 py-1.5 text-xs"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => review("APPROVED")}
          disabled={loading !== null}
          className="rounded-md border border-emerald-700 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-60"
        >
          {loading === "approve" ? "Aprobando..." : "Aprobar"}
        </button>
        <button
          type="button"
          onClick={() => review("NEEDS_CORRECTION")}
          disabled={loading !== null}
          className="rounded-md border border-amber-700 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-950/30 disabled:opacity-60"
        >
          {loading === "reject" ? "Devolviendo..." : "Devolver"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
