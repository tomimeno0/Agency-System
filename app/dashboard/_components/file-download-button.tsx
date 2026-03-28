"use client";

import { useState } from "react";

type Props = {
  fileId: string;
  label?: string;
  className?: string;
};

export function FileDownloadButton({ fileId, label = "Descargar", className }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/files/download-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    });

    setLoading(false);
    if (!response.ok) {
      setError("No se pudo generar el enlace de descarga.");
      return;
    }

    const payload = (await response.json()) as { data?: { downloadUrl?: string } };
    const url = payload.data?.downloadUrl;
    if (!url) {
      setError("No se pudo obtener el enlace.");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <button
        type="button"
        onClick={download}
        disabled={loading}
        className={
          className ??
          "rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
        }
      >
        {loading ? "Abriendo..." : label}
      </button>
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
