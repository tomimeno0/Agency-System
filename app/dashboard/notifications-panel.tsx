"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  status: "UNREAD" | "READ";
};

async function fetchUnread(since?: string): Promise<NotificationItem[]> {
  const search = new URLSearchParams({ unreadOnly: "true", take: "12" });
  if (since) {
    search.set("since", since);
  }

  const response = await fetch(`/api/notifications?${search.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) return [];

  const payload = (await response.json()) as {
    data?: {
      items?: NotificationItem[];
    };
  };
  return payload.data?.items ?? [];
}

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const lastPollAtRef = useRef<string | null>(null);
  const unreadCount = useMemo(() => items.length, [items]);

  async function refresh(useDelta = true) {
    const since = useDelta ? lastPollAtRef.current ?? undefined : undefined;
    const next = await fetchUnread(since);
    lastPollAtRef.current = new Date().toISOString();
    if (!useDelta || !since) {
      setItems(next);
      return;
    }
    setItems((prev) => {
      const merged = [...next, ...prev];
      return Array.from(new Map(merged.map((item) => [item.id, item])).values());
    });
  }

  async function markAsRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    await refresh(false);
  }

  async function markAllAsRead() {
    const ids = items.map((item) => item.id);
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/notifications/${id}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await refresh(false);
  }

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refresh(false);
    }, 0);
    const timer = window.setInterval(() => {
      void refresh(true);
    }, 15_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:border-zinc-500"
      >
        <span>Notificaciones</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            unreadCount > 0
              ? "border border-amber-700 bg-amber-950/30 text-amber-200"
              : "border border-zinc-700 text-zinc-400"
          }`}
        >
          {unreadCount}
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-auto rounded-md border border-zinc-700 bg-[#0b0f14] p-2 shadow-xl">
          {items.length === 0 ? (
            <p className="px-2 py-2 text-xs text-zinc-400">Sin notificaciones nuevas.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={markAllAsRead}
                className="mb-2 w-full rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Marcar todas como leidas
              </button>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs">
                    <p className="font-semibold text-zinc-100">{item.title}</p>
                    <p className="mt-1 text-zinc-300">{item.message}</p>
                    <div className="mt-2 flex items-center justify-between text-zinc-500">
                      <span>{new Date(item.createdAt).toLocaleString("es-AR")}</span>
                      <button
                        type="button"
                        onClick={() => markAsRead(item.id)}
                        className="underline hover:text-zinc-200"
                      >
                        Marcar leida
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
