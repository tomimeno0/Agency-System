"use client";

import { useState } from "react";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    const confirmed = window.confirm("¿Estas seguro que quieres eliminar esta tarea?");
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        alert("No se pudo eliminar la tarea.");
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
      onClick={onDelete}
      disabled={loading}
      className="inline-flex h-9 items-center rounded-md border border-red-700/70 px-2.5 text-red-300 hover:bg-red-950/25 disabled:opacity-60"
      aria-label="Eliminar tarea"
      title="Eliminar tarea"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M9 3.75A1.5 1.5 0 0 1 10.5 2.25h3A1.5 1.5 0 0 1 15 3.75V4.5h3a.75.75 0 0 1 0 1.5h-.54l-.86 12.04a2.25 2.25 0 0 1-2.24 2.09H9.64a2.25 2.25 0 0 1-2.24-2.09L6.54 6H6a.75.75 0 0 1 0-1.5h3V3.75Zm1.5.75V4.5h3v-.75h-3Zm-1.96 3a.75.75 0 0 1 .75.7l.5 8a.75.75 0 0 1-1.5.1l-.5-8a.75.75 0 0 1 .75-.8Zm6.92 0a.75.75 0 0 1 .75.8l-.5 8a.75.75 0 1 1-1.5-.1l.5-8a.75.75 0 0 1 .75-.7Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}
