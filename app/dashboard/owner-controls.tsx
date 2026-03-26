"use client";

import { useState } from "react";

type OwnerControlsProps = {
  assignmentMode: "AUTOMATIC" | "MANUAL";
  pendingManualInterventions: number;
};

export function OwnerControls({ assignmentMode, pendingManualInterventions }: OwnerControlsProps) {
  const [mode, setMode] = useState<"AUTOMATIC" | "MANUAL">(assignmentMode);
  const [saving, setSaving] = useState(false);

  async function updateMode(nextMode: "AUTOMATIC" | "MANUAL") {
    if (nextMode === mode) return;
    setSaving(true);

    const response = await fetch("/api/system/config", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ assignmentMode: nextMode }),
    });

    setSaving(false);
    if (!response.ok) return;
    setMode(nextMode);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-400">Modo de asignacion</p>
      <p className="mt-1 text-sm text-zinc-300">
        {mode === "AUTOMATIC" ? "Modo automatico activo" : "Modo manual activo"}
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        {pendingManualInterventions > 0
          ? `${pendingManualInterventions} tareas requieren intervencion manual`
          : "No hay tareas bloqueadas por asignacion"}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => updateMode("AUTOMATIC")}
          disabled={saving}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            mode === "AUTOMATIC"
              ? "bg-white text-black"
              : "border border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
          }`}
        >
          Automatico
        </button>

        <button
          type="button"
          onClick={() => updateMode("MANUAL")}
          disabled={saving}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            mode === "MANUAL"
              ? "bg-white text-black"
              : "border border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
          }`}
        >
          Manual
        </button>
      </div>
    </div>
  );
}
