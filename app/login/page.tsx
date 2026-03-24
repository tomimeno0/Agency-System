"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("No pudimos iniciar sesión con esas credenciales.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-[#0b0f14] px-6 py-16 text-[#e5e7eb]">
      <h1 className="text-3xl font-semibold tracking-tight">Iniciar sesión</h1>
      <p className="mt-2 text-sm text-zinc-400">Acceso interno de EDITEX STUDIO</p>

      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-3 py-2 outline-none transition focus:border-zinc-500"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-3 py-2 outline-none transition focus:border-zinc-500"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-white px-4 py-2 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Validando..." : "Entrar"}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/register" className="text-zinc-300 underline hover:text-white">
          Crear cuenta
        </Link>
        <Link href="/reset-password/request" className="text-zinc-300 underline hover:text-white">
          Olvidé mi contraseña
        </Link>
      </div>
    </main>
  );
}
