"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function RegisterForm({ signupOpen }: { signupOpen: boolean }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signupOpen) {
      setError("No se requieren nuevos editores en este momento. Contactate mas tarde.");
      return;
    }

    setMessage(null);
    setError(null);
    setLoading(true);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName,
        email,
        password,
        fullName: fullName || undefined,
        country: country || undefined,
      }),
    });

    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      if (payload?.error?.code === "VALIDATION_ERROR") {
        setError("La contrasena debe tener al menos 7 caracteres.");
      } else if (payload?.error?.code === "FORBIDDEN") {
        setError(payload?.error?.message ?? "No se requieren nuevos editores en este momento.");
      } else {
        setError("No se pudo enviar tu solicitud en este momento.");
      }
      return;
    }

    setMessage("Solicitud enviada. Te avisaremos cuando tu cuenta sea aprobada.");
    setDisplayName("");
    setEmail("");
    setPassword("");
    setFullName("");
    setCountry("");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0f14] px-6 py-16 text-[#e5e7eb]">
      <div className="-mt-10 w-full max-w-lg">
        <h1 className="text-4xl font-semibold tracking-tight">Crear cuenta</h1>
        <p className="mt-2 text-sm text-zinc-400">Registro para editores (requiere aprobacion)</p>

        {!signupOpen ? (
          <p className="mt-4 rounded-md border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
            No se requieren nuevos editores por ahora. Contactate mas tarde.
          </p>
        ) : null}

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <input
            type="text"
            className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-4 py-2.5 text-base outline-none transition focus:border-zinc-500 disabled:opacity-60"
            placeholder="Nombre visible"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            disabled={!signupOpen || loading}
          />
          <input
            type="email"
            className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-4 py-2.5 text-base outline-none transition focus:border-zinc-500 disabled:opacity-60"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={!signupOpen || loading}
          />
          <input
            type="password"
            className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-4 py-2.5 text-base outline-none transition focus:border-zinc-500 disabled:opacity-60"
            placeholder="Contrasena (7+ caracteres)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={!signupOpen || loading}
          />
          <input
            type="text"
            className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-4 py-2.5 text-base outline-none transition focus:border-zinc-500 disabled:opacity-60"
            placeholder="Nombre completo (opcional)"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            disabled={!signupOpen || loading}
          />
          <input
            type="text"
            className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-4 py-2.5 text-base outline-none transition focus:border-zinc-500 disabled:opacity-60"
            placeholder="Pais (opcional)"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            disabled={!signupOpen || loading}
          />

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

          <button
            type="submit"
            disabled={!signupOpen || loading}
            className="w-full rounded-lg bg-white px-4 py-2.5 text-base font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Enviando..." : "Enviar solicitud"}
          </button>
        </form>

        <Link href="/login" className="mt-6 block text-sm text-zinc-300 underline hover:text-white">
          Ya tengo cuenta
        </Link>
      </div>
    </main>
  );
}
