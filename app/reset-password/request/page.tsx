"use client";

import { FormEvent, useState } from "react";

export default function ResetPasswordRequestPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    const response = await fetch("/api/auth/reset-password/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;

      if (payload?.error?.code === "SMTP_NOT_CONFIGURED") {
        setError("No se puede recuperar contraseña ahora: falta configurar SMTP.");
      } else {
        setError("No se pudo procesar la solicitud.");
      }
      return;
    }

    setMessage("Si el email existe, enviamos instrucciones para restablecer la contraseña.");
    setEmail("");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-[#0b0f14] px-6 py-16 text-[#e5e7eb]">
      <h1 className="text-3xl font-semibold tracking-tight">Recuperar contraseña</h1>
      <p className="mt-2 text-sm text-zinc-400">Te enviaremos un enlace por email</p>

      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        <input
          type="email"
          className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-3 py-2 outline-none transition focus:border-zinc-500"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-white px-4 py-2 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Enviando..." : "Enviar enlace"}
        </button>
      </form>
    </main>
  );
}
