"use client";

import { useState } from "react";
import { useEffect } from "react";

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

function levelLabel(level: LearningItem["level"]): string {
  if (level === "BEGINNER") return "Beginner";
  if (level === "INTERMEDIATE") return "Intermediate";
  return "Advanced";
}

function levelClass(level: LearningItem["level"]): string {
  if (level === "BEGINNER") return "border-emerald-700 bg-emerald-950/30 text-emerald-200";
  if (level === "INTERMEDIATE") return "border-amber-700 bg-amber-950/30 text-amber-200";
  return "border-rose-700 bg-rose-950/30 text-rose-200";
}

function parseUrl(url: string): { host: string; path: string } | null {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname.replace(/^www\./i, ""),
      path: parsed.pathname === "/" ? "Recurso externo" : parsed.pathname,
    };
  } catch {
    return null;
  }
}

const previewCache = new Map<string, string>();

function usePreviewUrl(url: string): string | null | undefined {
  const [previewUrl, setPreviewUrl] = useState<string | null | undefined>(() =>
    previewCache.get(url) ?? undefined,
  );

  useEffect(() => {
    let cancelled = false;
    if (previewCache.has(url)) {
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      try {
        const response = await fetch(`/api/url-preview?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
          if (!cancelled) setPreviewUrl(null);
          return;
        }

        const payload = (await response.json()) as { data?: { imageUrl?: string | null } };
        const next = payload.data?.imageUrl ?? null;
        if (next) {
          previewCache.set(url, next);
        }
        if (!cancelled) setPreviewUrl(next);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return previewUrl;
}

function UrlPreview({ url, title }: { url: string; title: string }) {
  const parsed = parseUrl(url);
  const host = parsed?.host ?? "enlace";
  const path = parsed?.path ?? "Recurso externo";
  const previewUrl = usePreviewUrl(url);

  if (previewUrl === undefined) {
    return <div className="aspect-video w-full rounded-md border border-zinc-700 bg-zinc-950" />;
  }

  if (previewUrl) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={`Vista previa de ${title}`}
          className="aspect-video w-full rounded-md border border-zinc-700 object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group flex aspect-video w-full items-center rounded-md border border-zinc-700 bg-gradient-to-br from-zinc-900 to-black px-4 py-3 text-sm hover:border-zinc-500"
    >
      <div className="flex w-full items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs uppercase tracking-wide text-zinc-400">{host}</p>
          <p className="truncate text-sm text-zinc-200">{title}</p>
          <p className="truncate text-xs text-zinc-500">{path}</p>
        </div>
        <span className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition group-hover:border-zinc-500">
          Abrir
        </span>
      </div>
    </a>
  );
}

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    if (!isOwner) return;
    setError(null);
    setLoading(true);

    const response = await fetch("/api/learning/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        url: form.url.trim(),
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
      setError("No se pudo publicar el material.");
      return;
    }

    const payload = (await response.json()) as { data: LearningItem };
    setItems((prev) => [payload.data, ...prev]);
    setForm(EMPTY_FORM);
  }

  async function remove(itemId: string) {
    if (!isOwner) return;
    if (!confirm("Eliminar este material?")) return;
    setDeletingId(itemId);
    setError(null);

    const response = await fetch(`/api/learning/resources/${itemId}`, { method: "DELETE" });
    setDeletingId(null);
    if (!response.ok) {
      setError("No se pudo eliminar el material.");
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  return (
    <main>
      <header className="mb-5">
        <h1 className="text-3xl font-semibold text-white">Learning</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Biblioteca de materiales para aprender y mejorar el nivel de edicion.
        </p>
      </header>

      {isOwner ? (
        <section className="mb-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="mb-3 text-lg font-semibold">Publicar material</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm"
              placeholder="Titulo"
            />
            <input
              value={form.url}
              onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
              className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm"
              placeholder="URL (YouTube, PDF u otro recurso)"
            />
            <select
              value={form.level}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  level: event.target.value as LearningForm["level"],
                }))
              }
              className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm"
            >
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
            <input
              value={form.tags}
              onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
              className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm"
              placeholder="Tags separadas por coma"
            />
          </div>
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            className="mt-3 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            rows={4}
            placeholder="Descripcion"
          />
          <button
            type="button"
            onClick={publish}
            disabled={loading || !form.title.trim() || !form.url.trim()}
            className="mt-3 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Publicando..." : "Publicar"}
          </button>
          {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        </section>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <p className="text-sm text-zinc-300">No hay materiales todavia.</p>
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{item.description || "Sin descripcion."}</p>
                </div>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    disabled={deletingId === item.id}
                    className="rounded-md border border-red-700 px-2 py-1 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-60"
                  >
                    {deletingId === item.id ? "Eliminando..." : "Eliminar"}
                  </button>
                ) : null}
              </div>

              <UrlPreview url={item.url} title={item.title} />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-xs ${levelClass(item.level)}`}>
                  {levelLabel(item.level)}
                </span>
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                    #{tag}
                  </span>
                ))}
              </div>

              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm underline text-zinc-200 hover:text-white"
              >
                Abrir recurso
              </a>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
