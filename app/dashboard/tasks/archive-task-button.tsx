"use client";

import { useState } from "react";

export function ArchiveTaskButton({ taskId }: { taskId: string }) {
  const [loading, setLoading] = useState(false);

  async function onArchive() {
    const confirmed = window.confirm("¿Estas seguro que quieres archivar esta tarea?");
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/archive`, {
        method: "POST",
      });
      if (!response.ok) {
        alert("No se pudo archivar la tarea.");
        return;
      }
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onArchive}
      disabled={loading}
      className="h-9 rounded-md border border-amber-700/70 px-3 text-sm text-amber-300 hover:bg-amber-950/25 disabled:opacity-60"
      title="Archivar tarea"
    >
      Archivar
    </button>
  );
}
