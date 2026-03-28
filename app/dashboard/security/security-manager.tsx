"use client";

import { useState } from "react";

type Props = {
  canManageSignup: boolean;
  initialSignupOpen: boolean;
};

export function SecurityManager({ canManageSignup, initialSignupOpen }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"current" | "all" | "signup" | null>(null);
  const [signupOpen, setSignupOpen] = useState(initialSignupOpen);

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

    window.location.replace("/login");
  }

  async function toggleSignup() {
    if (!canManageSignup) return;
    setMessage(null);
    setError(null);
    setLoading("signup");

    const next = !signupOpen;
    const response = await fetch("/api/system/config/signup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editorSignupOpen: next }),
    });

    setLoading(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(payload?.error?.message ?? "No se pudo actualizar el estado del registro.");
      return;
    }

    setSignupOpen(next);
    setMessage(
      next
        ? "Registro de nuevos editores habilitado."
        : "Registro de nuevos editores bloqueado.",
    );
  }

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Seguridad</h1>

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
      </div>

      {canManageSignup ? (
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="text-lg font-semibold">Registro de editores</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Controla si en la pantalla de inicio se permite crear cuentas nuevas.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs ${
                signupOpen
                  ? "border-emerald-700 bg-emerald-950/30 text-emerald-200"
                  : "border-amber-700 bg-amber-950/30 text-amber-200"
              }`}
            >
              {signupOpen ? "Registro abierto" : "Registro cerrado"}
            </span>
            <button
              type="button"
              onClick={toggleSignup}
              disabled={loading !== null}
              className={`rounded-md border px-3 py-2 text-sm disabled:opacity-60 ${
                signupOpen
                  ? "border-red-700 text-red-300 hover:bg-red-950/30"
                  : "border-emerald-700 text-emerald-300 hover:bg-emerald-950/30"
              }`}
            >
              {loading === "signup"
                ? "Actualizando..."
                : signupOpen
                  ? "Bloquear nuevas cuentas"
                  : "Habilitar nuevas cuentas"}
            </button>
          </div>
          {!signupOpen ? (
            <p className="mt-3 text-xs text-zinc-400">
              Mensaje visible para usuarios: No se requieren nuevos editores en este momento.
              Contactate mas tarde.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
    </main>
  );
}
