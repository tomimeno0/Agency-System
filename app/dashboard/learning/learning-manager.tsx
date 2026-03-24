"use client";

import { useState } from "react";

type LearningItem = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  tags: string[];
  isActive: boolean;
};

type LearningForm = {
  title: string;
  description: string;
  url: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  tags: string;
};

const EMPTY_FORM: LearningForm = {
  title: "",
  description: "",
  url: "",
  level: "BEGINNER",
  tags: "",
};

export function LearningManager({
  initialItems,
  isOwner,
}: {
  initialItems: LearningItem[];
  isOwner: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [form, setForm] = useState<LearningForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    if (!isOwner) return;
    setError(null);
    setLoading(true);

    const response = await fetch("/api/learning/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || undefined,
        url: form.url,
        level: form.level,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        isActive: true,
      }),
    });

    setLoading(false);
    if (!response.ok) {
      setError("No se pudo publicar el recurso.");
      return;
    }

    const payload = (await response.json()) as { data: LearningItem };
    setItems((prev) => [payload.data, ...prev]);
    setForm(EMPTY_FORM);
  }

  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Learning</h1>

      {isOwner ? (
        <div className="mb-4 grid gap-2 rounded-xl bg-[#111827] p-4 md:grid-cols-5">
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Titulo"
          />
          <input
            value={form.url}
            onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="URL"
          />
          <select
            value={form.level}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                level: event.target.value as LearningForm["level"],
              }))
            }
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          >
            <option value="BEGINNER">BEGINNER</option>
            <option value="INTERMEDIATE">INTERMEDIATE</option>
            <option value="ADVANCED">ADVANCED</option>
          </select>
          <input
            value={form.tags}
            onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="tags separadas por coma"
          />
          <button
            type="button"
            onClick={publish}
            disabled={loading}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Publicando..." : "Publicar"}
          </button>
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            className="md:col-span-5 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            rows={3}
            placeholder="Descripcion"
          />
          {error ? <p className="md:col-span-5 text-sm text-red-400">{error}</p> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl bg-[#111827]">
        {items.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No data yet</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Titulo</th>
                <th className="px-4 py-3 font-medium">Nivel</th>
                <th className="px-4 py-3 font-medium">Descripcion</th>
                <th className="px-4 py-3 font-medium">URL</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-zinc-800">
                  <td className="px-4 py-3">{item.title}</td>
                  <td className="px-4 py-3">{item.level}</td>
                  <td className="px-4 py-3">{item.description ?? "-"}</td>
                  <td className="px-4 py-3">
                    <a href={item.url} target="_blank" rel="noreferrer" className="underline">
                      Abrir recurso
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
