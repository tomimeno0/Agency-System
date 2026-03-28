"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  user: {
    displayName: string;
    email: string;
    fullName: string | null;
    country: string | null;
    timezone: string;
  };
};

export function AccountForm({ user }: Props) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [country, setCountry] = useState(user.country ?? "");
  const [timezone, setTimezone] = useState(user.timezone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim(),
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        country: country.trim() || undefined,
        timezone: timezone.trim() || undefined,
      }),
    });

    setLoading(false);
    if (!response.ok) {
      setError("No se pudo actualizar la cuenta. Verifica si el email ya existe.");
      return;
    }

    setMessage("Cuenta actualizada.");
  }

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-3xl font-semibold">Cuenta</h1>
        <p className="text-base text-zinc-400">Actualiza tus datos personales.</p>
      </header>

      <section className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm"
            placeholder="Nombre visible"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm"
            placeholder="Email"
          />
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm"
            placeholder="Nombre completo"
          />
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm"
            placeholder="Pais"
          />
          <input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm"
            placeholder="Zona horaria"
          />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={loading || !displayName.trim() || !email.trim()}
          className="mt-4 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
      </section>

      <section className="mt-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-2 text-lg font-semibold">Password</h2>
        <p className="mb-3 text-sm text-zinc-400">
          Si necesitas cambiar tu contrasena, usa recuperacion por email.
        </p>
        <Link
          href="/reset-password/request"
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
        >
          Cambiar contrasena
        </Link>
      </section>
    </main>
  );
}
