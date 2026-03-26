"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ClientItem = {
  id: string;
  name: string;
  brandName: string | null;
  email: string | null;
  status: "ACTIVE" | "INACTIVE";
  activeTasks: number;
  lastActivity: string | null;
  createdAt: string;
};

type ClientForm = {
  name: string;
  brandName: string;
  email: string;
};

const EMPTY_FORM: ClientForm = {
  name: "",
  brandName: "",
  email: "",
};

export function ClientsManager({
  initialClients,
  canManage,
}: {
  initialClients: ClientItem[];
  canManage: boolean;
}) {
  const [clients, setClients] = useState<ClientItem[]>(initialClients);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isEditing = useMemo(() => Boolean(editingId), [editingId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) =>
      [client.name, client.brandName ?? "", client.email ?? ""].join(" ").toLowerCase().includes(term),
    );
  }, [clients, search]);

  function onChange(field: keyof ClientForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function startEdit(client: ClientItem) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      brandName: client.brandName ?? "",
      email: client.email ?? "",
    });
    setError(null);
  }

  async function refreshClients() {
    const response = await fetch("/api/clients", { method: "GET" });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      data?: {
        items?: Array<{
          id: string;
          name: string;
          brandName: string | null;
          email: string | null;
          status: "ACTIVE" | "INACTIVE";
        }>;
      };
    };
    const items = payload.data?.items ?? [];
    setClients((prev) =>
      items.map((item) => {
        const old = prev.find((candidate) => candidate.id === item.id);
        return {
          ...item,
          activeTasks: old?.activeTasks ?? 0,
          lastActivity: old?.lastActivity ?? null,
          createdAt: old?.createdAt ?? new Date().toISOString(),
        };
      }),
    );
  }

  async function submit() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);

    const body = {
      name: form.name.trim(),
      brandName: form.brandName.trim() || undefined,
      email: form.email.trim() || undefined,
    };

    const response = await fetch(editingId ? `/api/clients/${editingId}` : "/api/clients", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!response.ok) {
      setError("No se pudo guardar el cliente.");
      return;
    }

    await refreshClients();
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function removeClient(clientId: string) {
    if (!confirm("Eliminar cliente?")) return;
    const response = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
    if (!response.ok) return;
    setClients((prev) => prev.filter((item) => item.id !== clientId));
    if (editingId === clientId) {
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
  }

  return (
    <main>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-zinc-400">Base operativa de clientes y actividad</p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
          >
            Crear cliente
          </button>
        ) : null}
      </div>

      <div className="mb-4 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          placeholder="Buscar por nombre, marca o email"
        />
      </div>

      {canManage ? (
        <div className="mb-4 grid gap-2 rounded-xl border border-zinc-800 bg-[#111827] p-4 md:grid-cols-4">
          <input
            value={form.name}
            onChange={(event) => onChange("name", event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Nombre"
          />
          <input
            value={form.brandName}
            onChange={(event) => onChange("brandName", event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Marca"
          />
          <input
            value={form.email}
            onChange={(event) => onChange("email", event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Email"
          />
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-60"
          >
            {isEditing ? "Guardar cambios" : "Crear"}
          </button>
          {error ? <p className="md:col-span-4 text-sm text-red-400">{error}</p> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111827]">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No hay clientes cargados.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Marca</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Tareas activas</th>
                <th className="px-4 py-3 font-medium">Ultima actividad</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id} className="border-b border-zinc-800">
                  <td className="px-4 py-3">{client.name}</td>
                  <td className="px-4 py-3">{client.brandName ?? "-"}</td>
                  <td className="px-4 py-3">{client.email ?? "-"}</td>
                  <td className="px-4 py-3">{client.activeTasks}</td>
                  <td className="px-4 py-3">
                    {client.lastActivity ? new Date(client.lastActivity).toLocaleString("es-AR") : "-"}
                  </td>
                  <td className="px-4 py-3">{client.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/dashboard/clients/${client.id}`} className="text-xs underline hover:text-white">
                        Ver detalle
                      </Link>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(client)}
                            className="text-xs underline hover:text-white"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removeClient(client.id)}
                            className="text-xs underline text-red-300 hover:text-red-200"
                          >
                            Eliminar
                          </button>
                        </>
                      ) : null}
                    </div>
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
