"use client";

import { useMemo, useState } from "react";

type MovementType = "INCOME" | "EXPENSE";
type MovementStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

type MovementItem = {
  id: string;
  type: MovementType;
  status: MovementStatus;
  subtype: string | null;
  amount: number;
  currency: string;
  occurredAt: string;
  description: string;
  method: string | null;
  notes: string | null;
  clientId: string | null;
  clientName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  editorId: string | null;
  editorName: string | null;
};

type MovementForm = {
  type: MovementType;
  status: MovementStatus;
  subtype: string;
  amount: string;
  occurredAt: string;
  description: string;
  method: string;
  notes: string;
  clientId: string;
  campaignId: string;
  taskId: string;
  editorId: string;
};

const EMPTY_FORM: MovementForm = {
  type: "INCOME",
  status: "CONFIRMED",
  subtype: "",
  amount: "",
  occurredAt: "",
  description: "",
  method: "",
  notes: "",
  clientId: "",
  campaignId: "",
  taskId: "",
  editorId: "",
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function FinanceManager({
  initialMovements,
  clients,
  campaigns,
  tasks,
  editors,
  pendingPayoutEarnings,
}: {
  initialMovements: MovementItem[];
  clients: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
  tasks: Array<{ id: string; title: string }>;
  editors: Array<{ id: string; displayName: string }>;
  pendingPayoutEarnings: number;
}) {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "all">("month");
  const [movements, setMovements] = useState(initialMovements);
  const [form, setForm] = useState<MovementForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("10000");
  const [commissionPercent, setCommissionPercent] = useState(40);
  const [calcA, setCalcA] = useState("0");
  const [calcB, setCalcB] = useState("0");
  const [calcOp, setCalcOp] = useState<"+" | "-" | "*" | "/">("+");
  const [payoutHalf, setPayoutHalf] = useState<"first" | "second">(
    new Date().getDate() <= 15 ? "first" : "second",
  );
  const [payoutPreview, setPayoutPreview] = useState<{
    label: string;
    count: number;
    totalEditorNet: number;
    currency: string;
    items: Array<{
      id: string;
      editorName: string;
      taskTitle: string;
      amount: number;
    }>;
  } | null>(null);
  const [payoutLoading, setPayoutLoading] = useState<false | "preview" | "execute">(false);

  const filteredByPeriod = useMemo(() => {
    const now = new Date();
    const fromToday = startOfDay(now);
    const fromWeek = new Date(fromToday.getTime() - 6 * 24 * 60 * 60 * 1000);
    const fromMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return movements.filter((movement) => {
      const date = new Date(movement.occurredAt);
      if (period === "today") return date >= fromToday;
      if (period === "week") return date >= fromWeek;
      if (period === "month") return date >= fromMonth;
      return true;
    });
  }, [movements, period]);

  const visibleMovements = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return filteredByPeriod;
    return filteredByPeriod.filter((movement) =>
      [
        movement.description,
        movement.subtype ?? "",
        movement.clientName ?? "",
        movement.editorName ?? "",
        movement.taskTitle ?? "",
        movement.method ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [filteredByPeriod, search]);

  const financialSummary = useMemo(() => {
    const confirmed = filteredByPeriod.filter((movement) => movement.status !== "CANCELLED");
    const income = confirmed
      .filter((movement) => movement.type === "INCOME")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const expense = confirmed
      .filter((movement) => movement.type === "EXPENSE")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const pending = filteredByPeriod.filter((movement) => movement.status === "PENDING").length;

    return {
      income,
      expense,
      balance: income - expense,
      pending,
    };
  }, [filteredByPeriod]);

  const chartPoints = useMemo(() => {
    const byDay = new Map<string, { income: number; expense: number }>();
    const sorted = [...filteredByPeriod].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );

    for (const item of sorted) {
      if (item.status === "CANCELLED") continue;
      const key = new Date(item.occurredAt).toISOString().slice(0, 10);
      const row = byDay.get(key) ?? { income: 0, expense: 0 };
      if (item.type === "INCOME") row.income += item.amount;
      else row.expense += item.amount;
      byDay.set(key, row);
    }

    let runningBalance = 0;
    return Array.from(byDay.entries()).map(([date, values]) => {
      const net = values.income - values.expense;
      runningBalance += net;
      return {
        date,
        ...values,
        net,
        runningBalance,
      };
    });
  }, [filteredByPeriod]);

  const maxChartValue = useMemo(() => {
    if (chartPoints.length === 0) return 1;
    return Math.max(
      ...chartPoints.map((point) =>
        Math.max(Math.abs(point.income), Math.abs(point.expense), Math.abs(point.runningBalance)),
      ),
      1,
    );
  }, [chartPoints]);

  const commissionBase = Number(commissionAmount) || 0;
  const agencyCommission = (commissionBase * commissionPercent) / 100;
  const editorAmount = commissionBase - agencyCommission;

  const basicCalculatorResult = useMemo(() => {
    const a = Number(calcA) || 0;
    const b = Number(calcB) || 0;
    if (calcOp === "+") return a + b;
    if (calcOp === "-") return a - b;
    if (calcOp === "*") return a * b;
    if (b === 0) return 0;
    return a / b;
  }, [calcA, calcB, calcOp]);

  function setFormField<K extends keyof MovementForm>(field: K, value: MovementForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function startEdit(movement: MovementItem) {
    setEditingId(movement.id);
    setForm({
      type: movement.type,
      status: movement.status,
      subtype: movement.subtype ?? "",
      amount: String(movement.amount),
      occurredAt: new Date(new Date(movement.occurredAt).getTime() - new Date(movement.occurredAt).getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16),
      description: movement.description,
      method: movement.method ?? "",
      notes: movement.notes ?? "",
      clientId: movement.clientId ?? "",
      campaignId: movement.campaignId ?? "",
      taskId: movement.taskId ?? "",
      editorId: movement.editorId ?? "",
    });
    setError(null);
  }

  async function refreshMovements() {
    const response = await fetch("/api/finance/movements?take=2000");
    if (!response.ok) return;

    const payload = (await response.json()) as {
      data?: {
        items?: Array<{
          id: string;
          type: MovementType;
          status: MovementStatus;
          subtype: string | null;
          amount: number | string;
          currency: string;
          occurredAt: string;
          description: string;
          method: string | null;
          notes: string | null;
          clientId: string | null;
          campaignId: string | null;
          taskId: string | null;
          client?: { name: string; brandName: string | null } | null;
          campaign?: { name: string } | null;
          task?: { title: string } | null;
          editor?: { id: string; displayName: string } | null;
        }>;
      };
    };

    const items = payload.data?.items ?? [];
    setMovements(
      items.map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        subtype: item.subtype,
        amount: Number(item.amount),
        currency: item.currency,
        occurredAt: item.occurredAt,
        description: item.description,
        method: item.method,
        notes: item.notes,
        clientId: item.clientId,
        clientName: item.client?.brandName ?? item.client?.name ?? null,
        campaignId: item.campaignId,
        campaignName: item.campaign?.name ?? null,
        taskId: item.taskId,
        taskTitle: item.task?.title ?? null,
        editorId: item.editor?.id ?? null,
        editorName: item.editor?.displayName ?? null,
      })),
    );
  }

  async function saveMovement() {
    if (!form.description.trim() || !form.amount) {
      setError("Descripcion y monto son obligatorios.");
      return;
    }

    setLoading("save");
    setError(null);
    const payload = {
      type: form.type,
      status: form.status,
      subtype: form.subtype || undefined,
      amount: Number(form.amount),
      occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
      description: form.description.trim(),
      method: form.method || undefined,
      notes: form.notes || undefined,
      clientId: form.clientId || undefined,
      campaignId: form.campaignId || undefined,
      taskId: form.taskId || undefined,
      editorId: form.editorId || undefined,
    };

    const response = await fetch(
      editingId ? `/api/finance/movements/${editingId}` : "/api/finance/movements",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    setLoading(null);

    if (!response.ok) {
      setError("No se pudo guardar el movimiento.");
      return;
    }

    await refreshMovements();
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function deleteMovement(id: string) {
    if (!confirm("Eliminar movimiento?")) return;
    setLoading("delete");
    setError(null);
    const response = await fetch(`/api/finance/movements/${id}`, {
      method: "DELETE",
    });
    setLoading(null);
    if (!response.ok) {
      setError("No se pudo eliminar el movimiento.");
      return;
    }
    await refreshMovements();
  }

  async function previewBiweeklyPayout() {
    setPayoutLoading("preview");
    setError(null);
    try {
      const response = await fetch("/api/finance/payouts/biweekly/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ half: payoutHalf }),
      });
      if (!response.ok) {
        throw new Error("No se pudo generar la previsualizacion quincenal.");
      }
      const payload = (await response.json()) as {
        data?: {
          range?: { label?: string };
          totals?: { count?: number; totalEditorNet?: number; currency?: string };
          items?: Array<{
            id: string;
            editor?: { displayName?: string | null } | null;
            taskAssignment?: { task?: { title?: string | null } | null } | null;
            editorNetAmount?: number | string;
          }>;
        };
      };
      const items = payload.data?.items ?? [];
      setPayoutPreview({
        label: payload.data?.range?.label ?? "Corte",
        count: payload.data?.totals?.count ?? items.length,
        totalEditorNet: Number(payload.data?.totals?.totalEditorNet ?? 0),
        currency: payload.data?.totals?.currency ?? "ARS",
        items: items.map((item) => ({
          id: item.id,
          editorName: item.editor?.displayName ?? "Editor",
          taskTitle: item.taskAssignment?.task?.title ?? "Sin tarea",
          amount: Number(item.editorNetAmount ?? 0),
        })),
      });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "No se pudo previsualizar.");
    } finally {
      setPayoutLoading(false);
    }
  }

  async function executeBiweeklyPayout() {
    if (!payoutPreview || payoutPreview.count === 0) return;
    if (!confirm("Ejecutar liquidacion manual para este corte quincenal?")) return;

    setPayoutLoading("execute");
    setError(null);
    try {
      const response = await fetch("/api/finance/payouts/biweekly/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          half: payoutHalf,
          earningIds: payoutPreview.items.map((item) => item.id),
        }),
      });
      if (!response.ok) {
        throw new Error("No se pudo ejecutar la liquidacion quincenal.");
      }
      await refreshMovements();
      await previewBiweeklyPayout();
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : "No se pudo ejecutar la liquidacion.");
    } finally {
      setPayoutLoading(false);
    }
  }

  return (
    <main>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Finanzas</h1>
          <p className="text-sm text-zinc-400">Control financiero manual, sin depender de integraciones</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { key: "today", label: "Hoy" },
            { key: "week", label: "Esta semana" },
            { key: "month", label: "Este mes" },
            { key: "all", label: "Todo" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriod(item.key as "today" | "week" | "month" | "all")}
              className={`rounded-md border px-3 py-1.5 ${
                period === item.key
                  ? "border-white bg-white text-black"
                  : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <p className="text-xs text-zinc-400">Ingresos</p>
          <p className="text-2xl font-semibold">${financialSummary.income.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <p className="text-xs text-zinc-400">Egresos</p>
          <p className="text-2xl font-semibold">${financialSummary.expense.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <p className="text-xs text-zinc-400">Balance neto</p>
          <p className="text-2xl font-semibold">${financialSummary.balance.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <p className="text-xs text-zinc-400">Pagos pendientes</p>
          <p className="text-2xl font-semibold">{financialSummary.pending + pendingPayoutEarnings}</p>
        </div>
      </section>

      <section className="mb-4 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Liquidacion quincenal manual</h2>
          <div className="flex gap-2">
            <select
              value={payoutHalf}
              onChange={(event) => setPayoutHalf(event.target.value as "first" | "second")}
              className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            >
              <option value="first">Corte 1-15</option>
              <option value="second">Corte 16-fin</option>
            </select>
            <button
              type="button"
              onClick={previewBiweeklyPayout}
              disabled={payoutLoading !== false}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
            >
              {payoutLoading === "preview" ? "Calculando..." : "Previsualizar"}
            </button>
            <button
              type="button"
              onClick={executeBiweeklyPayout}
              disabled={payoutLoading !== false || !payoutPreview || payoutPreview.count === 0}
              className="rounded-md border border-emerald-700 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-60"
            >
              {payoutLoading === "execute" ? "Ejecutando..." : "Ejecutar pago quincenal"}
            </button>
          </div>
        </div>

        {!payoutPreview ? (
          <p className="text-sm text-zinc-400">
            Genera una previsualizacion para ver que earnings aprobadas entran en el corte.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                <p className="text-xs text-zinc-400">Corte</p>
                <p className="text-sm font-semibold">{payoutPreview.label}</p>
              </div>
              <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                <p className="text-xs text-zinc-400">Items</p>
                <p className="text-sm font-semibold">{payoutPreview.count}</p>
              </div>
              <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                <p className="text-xs text-zinc-400">Total a pagar</p>
                <p className="text-sm font-semibold">
                  ${payoutPreview.totalEditorNet.toFixed(2)} {payoutPreview.currency}
                </p>
              </div>
            </div>
            <div className="max-h-44 overflow-auto rounded-md border border-zinc-700">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-700 text-zinc-300">
                  <tr>
                    <th className="px-2 py-2 font-medium">Editor</th>
                    <th className="px-2 py-2 font-medium">Tarea</th>
                    <th className="px-2 py-2 font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutPreview.items.map((item) => (
                    <tr key={item.id} className="border-b border-zinc-800">
                      <td className="px-2 py-2">{item.editorName}</td>
                      <td className="px-2 py-2">{item.taskTitle}</td>
                      <td className="px-2 py-2">${item.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="mb-4 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Registro de movimientos</h2>
        <div className="grid gap-2 md:grid-cols-4">
          <select
            value={form.type}
            onChange={(event) => setFormField("type", event.target.value as MovementType)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          >
            <option value="INCOME">Ingreso</option>
            <option value="EXPENSE">Egreso</option>
          </select>
          <select
            value={form.status}
            onChange={(event) => setFormField("status", event.target.value as MovementStatus)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          >
            <option value="CONFIRMED">Confirmado</option>
            <option value="PENDING">Pendiente</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
          <input
            value={form.subtype}
            onChange={(event) => setFormField("subtype", event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Subtipo (pago cliente, comision, etc.)"
          />
          <input
            value={form.amount}
            onChange={(event) => setFormField("amount", event.target.value)}
            type="number"
            min={0}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Monto"
          />
          <input
            value={form.occurredAt}
            onChange={(event) => setFormField("occurredAt", event.target.value)}
            type="datetime-local"
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          />
          <input
            value={form.description}
            onChange={(event) => setFormField("description", event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Descripcion"
          />
          <select
            value={form.clientId}
            onChange={(event) => setFormField("clientId", event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          >
            <option value="">Sin cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <select
            value={form.campaignId}
            onChange={(event) => setFormField("campaignId", event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          >
            <option value="">Sin campana</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
          <select
            value={form.taskId}
            onChange={(event) => setFormField("taskId", event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          >
            <option value="">Sin task</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
          <select
            value={form.editorId}
            onChange={(event) => setFormField("editorId", event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
          >
            <option value="">Sin editor</option>
            {editors.map((editor) => (
              <option key={editor.id} value={editor.id}>
                {editor.displayName}
              </option>
            ))}
          </select>
          <input
            value={form.method}
            onChange={(event) => setFormField("method", event.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Metodo"
          />
          <textarea
            value={form.notes}
            onChange={(event) => setFormField("notes", event.target.value)}
            className="md:col-span-2 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            rows={2}
            placeholder="Notas"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveMovement}
              disabled={loading !== null}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
            >
              {loading === "save" ? "Guardando..." : editingId ? "Guardar cambios" : "Crear movimiento"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={startCreate}
                className="w-full rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      </section>

      <section className="mb-4 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Grafico financiero</h2>
        {chartPoints.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin datos para el periodo seleccionado.</p>
        ) : (
          <div className="space-y-2">
            {chartPoints.slice(-20).map((point) => (
              <div key={point.date} className="grid grid-cols-[90px_1fr_100px] items-center gap-3 text-xs">
                <span className="text-zinc-400">{point.date}</span>
                <div className="h-5 rounded bg-zinc-900">
                  <div
                    className={`h-5 rounded ${point.net >= 0 ? "bg-emerald-600/70" : "bg-red-600/70"}`}
                    style={{
                      width: `${Math.max(4, Math.round((Math.abs(point.net) / maxChartValue) * 100))}%`,
                    }}
                  />
                </div>
                <span className={point.net >= 0 ? "text-emerald-300" : "text-red-300"}>
                  {point.net >= 0 ? "+" : "-"}${Math.abs(point.net).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="mb-3 text-lg font-semibold">Calculadora de comision</h2>
          <input
            value={commissionAmount}
            onChange={(event) => setCommissionAmount(event.target.value)}
            type="number"
            min={0}
            className="mb-3 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Precio del trabajo"
          />
          <input
            type="range"
            min={10}
            max={60}
            step={10}
            value={commissionPercent}
            onChange={(event) => setCommissionPercent(Number(event.target.value))}
            className="w-full"
          />
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {[10, 20, 30, 40, 50, 60].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCommissionPercent(value)}
                className={`rounded border px-2 py-1 ${
                  commissionPercent === value
                    ? "border-white bg-white text-black"
                    : "border-zinc-700 bg-zinc-900 text-zinc-200"
                }`}
              >
                {value}%
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <p>Comision agencia: ${agencyCommission.toFixed(2)}</p>
            <p>Monto editor: ${editorAmount.toFixed(2)}</p>
            <p>Total: ${commissionBase.toFixed(2)}</p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
          <h2 className="mb-3 text-lg font-semibold">Calculadora simple</h2>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={calcA}
              onChange={(event) => setCalcA(event.target.value)}
              type="number"
              className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            />
            <select
              value={calcOp}
              onChange={(event) => setCalcOp(event.target.value as "+" | "-" | "*" | "/")}
              className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            >
              <option value="+">+</option>
              <option value="-">-</option>
              <option value="*">*</option>
              <option value="/">/</option>
            </select>
            <input
              value={calcB}
              onChange={(event) => setCalcB(event.target.value)}
              type="number"
              className="rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            />
          </div>
          <p className="mt-4 text-2xl font-semibold">Resultado: {basicCalculatorResult}</p>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Movimientos</h2>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full max-w-xs rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            placeholder="Buscar movimiento"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-2 py-2 font-medium">Fecha</th>
                <th className="px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 font-medium">Monto</th>
                <th className="px-2 py-2 font-medium">Descripcion</th>
                <th className="px-2 py-2 font-medium">Editor</th>
                <th className="px-2 py-2 font-medium">Cliente / Campana / Task</th>
                <th className="px-2 py-2 font-medium">Estado</th>
                <th className="px-2 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleMovements.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-zinc-400" colSpan={8}>
                    No hay movimientos en este filtro.
                  </td>
                </tr>
              ) : (
                visibleMovements.map((movement) => (
                  <tr key={movement.id} className="border-b border-zinc-800">
                    <td className="px-2 py-2">{new Date(movement.occurredAt).toLocaleString("es-AR")}</td>
                    <td className="px-2 py-2">{movement.type === "INCOME" ? "Ingreso" : "Egreso"}</td>
                    <td className="px-2 py-2">${movement.amount.toFixed(2)}</td>
                    <td className="px-2 py-2">
                      <p>{movement.description}</p>
                      {movement.subtype ? <p className="text-xs text-zinc-400">{movement.subtype}</p> : null}
                    </td>
                    <td className="px-2 py-2">{movement.editorName ?? "-"}</td>
                    <td className="px-2 py-2">
                      <p>{movement.clientName ?? "-"}</p>
                      <p className="text-xs text-zinc-400">{movement.campaignName ?? "-"}</p>
                      <p className="text-xs text-zinc-500">{movement.taskTitle ?? "-"}</p>
                    </td>
                    <td className="px-2 py-2">{movement.status}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(movement)}
                          className="text-xs underline hover:text-white"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMovement(movement.id)}
                          disabled={loading !== null}
                          className="text-xs underline text-red-300 hover:text-red-200 disabled:opacity-60"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
