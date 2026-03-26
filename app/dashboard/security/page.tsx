"use client";

import { useState } from "react";

export default function SecurityPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"current" | "all" | null>(null);

  async function revoke(scope: "current" | "all") {
    setMessage(null);
    setError(null);
    setLoading(scope);

    const response = await fetch("/api/auth/sessions/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    });

    setLoading(null);
    if (!response.ok) {
      setError("No se pudieron revocar las sesiones.");
      return;
    }

    const payload = (await response.json()) as { data?: { revoked?: number } };
    setMessage(`Sesiones revocadas: ${payload.data?.revoked ?? 0}`);
  }

  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Seguridad</h1>
      <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <p className="mb-4 text-sm text-zinc-300">Gestiona tus sesiones activas.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => revoke("current")}
            disabled={loading !== null}
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading === "current" ? "Procesando..." : "Cerrar sesion actual"}
          </button>
          <button
            type="button"
            onClick={() => revoke("all")}
            disabled={loading !== null}
            className="rounded-md border border-red-700 px-3 py-2 text-sm text-red-300 hover:bg-red-950/30 disabled:opacity-60"
          >
            {loading === "all" ? "Procesando..." : "Cerrar todas las sesiones"}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
      </div>
    </main>
  );
}
