"use client";

import { FormEvent, useState } from "react";

type Props = {
  token: string;
};

export function ResetPasswordConfirmForm({ token }: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    const response = await fetch("/api/auth/reset-password/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });

    setLoading(false);

    if (!response.ok) {
      setError("No se pudo cambiar la contrasena. Revisa el enlace o solicita uno nuevo.");
      return;
    }

    setMessage("Contrasena actualizada. Ya puedes iniciar sesion.");
    setNewPassword("");
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={onSubmit}>
      <input
        type="password"
        className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-3 py-2 outline-none transition focus:border-zinc-500"
        placeholder="Nueva contrasena (minimo 7)"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
      />

      {!token ? (
        <p className="text-sm text-red-400">Token invalido. Abre el link recibido por email.</p>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

      <button
        type="submit"
        disabled={loading || !token}
        className="w-full rounded-lg bg-white px-4 py-2 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Actualizando..." : "Guardar contrasena"}
      </button>
    </form>
  );
}
