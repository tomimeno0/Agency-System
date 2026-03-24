"use client";

import { useMemo, useState } from "react";

type ClientItem = {
  id: string;
  name: string;
  brandName: string | null;
  email: string | null;
  status: "ACTIVE" | "INACTIVE";
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

export function ClientsManager({ initialClients }: { initialClients: ClientItem[] }) {
  const [clients, setClients] = useState<ClientItem[]>(initialClients);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = useMemo(() => Boolean(editingId), [editingId]);

  function onChange(field: keyof ClientForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(client: ClientItem) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      brandName: client.brandName ?? "",
      email: client.email ?? "",
    });
  }

  async function refreshClients() {
    const response = await fetch("/api/clients", { method: "GET" });
    if (!response.ok) return;
    const payload = (await response.json()) as { data?: { items?: ClientItem[] } };
    setClients(payload.data?.items ?? []);
  }

  async function submit() {
    if (!form.name.trim()) return;
    setSaving(true);

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
    if (!response.ok) return;
    await refreshClients();
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function removeClient(clientId: string) {
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-md border border-zinc-700 bg-[#111827] px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
        >
          Create Client
        </button>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl bg-[#111827] p-4 md:grid-cols-4">
        <input
          value={form.name}
          onChange={(event) => onChange("name", event.target.value)}
          className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          placeholder="Name"
        />
        <input
          value={form.brandName}
          onChange={(event) => onChange("brandName", event.target.value)}
          className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          placeholder="Brand"
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
          {isEditing ? "Save" : "Create"}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl bg-[#111827]">
        {clients.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No data yet</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b border-zinc-800">
                  <td className="px-4 py-3">{client.name}</td>
                  <td className="px-4 py-3">{client.brandName ?? "-"}</td>
                  <td className="px-4 py-3">{client.email ?? "-"}</td>
                  <td className="px-4 py-3">{client.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(client)}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeClient(client.id)}
                        className="rounded-md border border-red-700 px-2 py-1 text-xs text-red-300 hover:bg-red-950/30"
                      >
                        Delete
                      </button>
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
