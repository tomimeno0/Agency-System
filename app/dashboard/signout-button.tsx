"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-md border border-zinc-700 bg-[#111827] px-3 py-1.5 text-sm font-medium text-[#e5e7eb] transition hover:bg-zinc-800"
    >
      Cerrar sesion
    </button>
  );
}
