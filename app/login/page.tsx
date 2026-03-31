"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.split("=")[1] ?? "") : null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    if (step === "credentials") {
      const csrfToken = getCookie("app-csrf-token");
      const response = await fetch("/api/auth/2fa/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ email, password }),
      });
      setLoading(false);
      if (!response.ok) {
        setError("No pudimos iniciar sesion con esas credenciales.");
        return;
      }
      const payload = (await response.json()) as { data?: { challengeId?: string } };
      if (!payload.data?.challengeId) {
        setError("No pudimos iniciar sesion con esas credenciales.");
        return;
      }
      setChallengeId(payload.data.challengeId);
      setStep("otp");
      return;
    }

    if (!challengeId) {
      setLoading(false);
      setError("Sesion de verificacion expirada. Volve a ingresar tus credenciales.");
      setStep("credentials");
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      challengeId,
      otpCode,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("No pudimos iniciar sesion con esas credenciales.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function resendCode() {
    if (!challengeId) return;
    setError(null);
    const csrfToken = getCookie("app-csrf-token");
    const response = await fetch("/api/auth/2fa/resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify({ challengeId }),
    });
    if (!response.ok) {
      setError("No se pudo reenviar el codigo.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0f14] px-6 py-16 text-[#e5e7eb]">
      <div className="-mt-10 w-full max-w-lg">
        <h1 className="text-4xl font-semibold tracking-tight">Iniciar sesion</h1>
        <p className="mt-2 text-sm text-zinc-400">Acceso interno de EDITEX STUDIO</p>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-4 py-2.5 text-base outline-none transition focus:border-zinc-500"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={step === "otp"}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="password">
              Contrasena
            </label>
            <input
              id="password"
              type="password"
              className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-4 py-2.5 text-base outline-none transition focus:border-zinc-500"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={step === "otp"}
            />
          </div>

          {step === "otp" ? (
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="otp">
                Codigo 2FA (email)
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                className="w-full rounded-lg border border-zinc-700 bg-[#111827] px-4 py-2.5 text-base outline-none transition focus:border-zinc-500"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-white px-4 py-2.5 text-base font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Validando..." : step === "credentials" ? "Continuar" : "Entrar"}
          </button>

          {step === "otp" ? (
            <div className="flex items-center justify-between text-sm text-zinc-300">
              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setChallengeId(null);
                  setOtpCode("");
                }}
                className="underline hover:text-white"
              >
                Cambiar credenciales
              </button>
              <button type="button" onClick={resendCode} className="underline hover:text-white">
                Reenviar codigo
              </button>
            </div>
          ) : null}
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href="/register" className="text-zinc-300 underline hover:text-white">
            Crear cuenta
          </Link>
          <Link href="/reset-password/request" className="text-zinc-300 underline hover:text-white">
            Olvide mi contrasena
          </Link>
        </div>
      </div>
    </main>
  );
}
