"use client";

import { useMemo, useState } from "react";
import { EditorTaskActions } from "./editor-task-actions";

type EditorTaskRow = {
  id: string;
  title: string;
  campaignId: string | null;
  campaignName: string | null;
  clientName: string;
  status: "Pendiente" | "En proceso" | "En revision" | "Correccion" | "Completada";
  deadlineAt: string | null;
  priority: "Alta" | "Media" | "Baja";
  assignmentId: string | null;
  pendingAcceptance: boolean;
  canDeliver: boolean;
};

type EditorBoardFilters = {
  estado?: string;
  prioridad?: string;
  deadline?: string;
  cliente?: string;
};

function statusBadge(status: EditorTaskRow["status"]): string {
  if (status === "Pendiente") return "border border-blue-700 bg-blue-950/20 text-blue-200";
  if (status === "En proceso") return "border border-amber-700 bg-amber-950/20 text-amber-200";
  if (status === "En revision") return "border border-violet-700 bg-violet-950/20 text-violet-200";
  if (status === "Correccion") return "border border-orange-700 bg-orange-950/20 text-orange-200";
  return "border border-emerald-700 bg-emerald-950/20 text-emerald-200";
}

function priorityBadge(priority: EditorTaskRow["priority"]): string {
  if (priority === "Alta") return "border border-red-700 bg-red-950/20 text-red-200";
  if (priority === "Media") return "border border-amber-700 bg-amber-950/20 text-amber-200";
  return "border border-emerald-700 bg-emerald-950/20 text-emerald-200";
}

export function EditorTasksBoard({
  tasks,
  initialFilters,
}: {
  tasks: EditorTaskRow[];
  initialFilters?: EditorBoardFilters;
}) {
  const [statusFilter, setStatusFilter] = useState(initialFilters?.estado ?? "todos");
  const [priorityFilter, setPriorityFilter] = useState(initialFilters?.prioridad ?? "todos");
  const [deadlineFilter, setDeadlineFilter] = useState(initialFilters?.deadline ?? "todos");
  const [clientFilter, setClientFilter] = useState(initialFilters?.cliente ?? "todos");
  const [campaignLoading, setCampaignLoading] = useState<string | null>(null);
  const [campaignActionError, setCampaignActionError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const startDay = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    [now],
  );
  const endDay = useMemo(() => new Date(startDay.getTime() + 24 * 60 * 60 * 1000), [startDay]);
  const in24h = useMemo(() => new Date(now.getTime() + 24 * 60 * 60 * 1000), [now]);
  const in48h = useMemo(() => new Date(now.getTime() + 48 * 60 * 60 * 1000), [now]);

  const clients = useMemo(
    () =>
      Array.from(new Set(tasks.map((task) => task.clientName))).sort((a, b) => a.localeCompare(b)),
    [tasks],
  );

  const rows = useMemo(
    () =>
      tasks
        .filter((task) => (statusFilter === "todos" ? true : task.status === statusFilter))
        .filter((task) => (priorityFilter === "todos" ? true : task.priority === priorityFilter))
        .filter((task) => (clientFilter === "todos" ? true : task.clientName === clientFilter))
        .filter((task) => {
          const deadline = task.deadlineAt ? new Date(task.deadlineAt) : null;
          if (deadlineFilter === "todos") return true;
          if (deadlineFilter === "sin_deadline") return deadline === null;
          if (!deadline) return false;
          if (deadlineFilter === "vencidas") return deadline < now;
          if (deadlineFilter === "hoy") return deadline >= startDay && deadline < endDay;
          if (deadlineFilter === "24h") return deadline >= now && deadline <= in24h;
          if (deadlineFilter === "48h") return deadline >= now && deadline <= in48h;
          return true;
        }),
    [tasks, statusFilter, priorityFilter, clientFilter, deadlineFilter, now, startDay, endDay, in24h, in48h],
  );

  const pendingCampaigns = useMemo(() => {
    const map = new Map<string, { id: string; name: string; pendingCount: number }>();
    for (const task of tasks) {
      if (!task.pendingAcceptance || !task.campaignId) continue;
      const current = map.get(task.campaignId);
      if (current) {
        current.pendingCount += 1;
      } else {
        map.set(task.campaignId, {
          id: task.campaignId,
          name: task.campaignName ?? "Campana",
          pendingCount: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.pendingCount - a.pendingCount);
  }, [tasks]);

  async function respondCampaign(campaignId: string, decision: "accept" | "reject") {
    setCampaignActionError(null);
    setCampaignLoading(campaignId);
    const reason =
      decision === "reject"
        ? window.prompt("Motivo de rechazo para toda la campana (opcional):", "") ?? ""
        : undefined;
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reason: reason || undefined,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? "No se pudo responder la campana.");
      }
      window.location.reload();
    } catch (error) {
      setCampaignActionError(
        error instanceof Error ? error.message : "No se pudo responder la campana.",
      );
      setCampaignLoading(null);
    }
  }

  return (
    <main className="w-full">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Mis tareas</h1>
        <p className="text-base text-zinc-400">Organiza, acepta, trabaja y entrega.</p>
      </div>

      {pendingCampaigns.length > 0 ? (
        <section className="mb-5 rounded-xl border border-blue-800 bg-blue-950/20 p-4">
          <h2 className="mb-2 text-lg font-semibold text-blue-100">Campanas pendientes de aceptar</h2>
          <p className="mb-3 text-sm text-blue-200">
            Acepta una vez y se aceptan todas las tareas pendientes de esa campana.
          </p>
          <div className="space-y-2">
            {pendingCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-700 bg-[#0b0f14] px-3 py-2"
              >
                <div>
                  <p className="font-medium text-blue-100">{campaign.name}</p>
                  <p className="text-xs text-blue-300">
                    {campaign.pendingCount} tarea(s) pendientes de aceptar
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => respondCampaign(campaign.id, "accept")}
                    disabled={campaignLoading !== null}
                    className="rounded-md border border-emerald-700 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-60"
                  >
                    {campaignLoading === campaign.id ? "Procesando..." : "Aceptar campana"}
                  </button>
                  <button
                    type="button"
                    onClick={() => respondCampaign(campaign.id, "reject")}
                    disabled={campaignLoading !== null}
                    className="rounded-md border border-red-700 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-60"
                  >
                    Rechazar campana
                  </button>
                </div>
              </div>
            ))}
          </div>
          {campaignActionError ? <p className="mt-2 text-sm text-red-300">{campaignActionError}</p> : null}
        </section>
      ) : null}

      <div className="mb-5 grid gap-2 rounded-xl border border-zinc-800 bg-[#111827] p-4 md:grid-cols-4">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-base"
        >
          <option value="todos">Estado: todos</option>
          <option value="Pendiente">Pendiente</option>
          <option value="En proceso">En proceso</option>
          <option value="En revision">En revision</option>
          <option value="Correccion">Correccion</option>
          <option value="Completada">Completada</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value)}
          className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-base"
        >
          <option value="todos">Prioridad: todas</option>
          <option value="Alta">Alta</option>
          <option value="Media">Media</option>
          <option value="Baja">Baja</option>
        </select>
        <select
          value={deadlineFilter}
          onChange={(event) => setDeadlineFilter(event.target.value)}
          className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-base"
        >
          <option value="todos">Deadline: todos</option>
          <option value="vencidas">Vencidas</option>
          <option value="hoy">Hoy</option>
          <option value="24h">Proximas 24h</option>
          <option value="48h">Proximas 48h</option>
          <option value="sin_deadline">Sin deadline</option>
        </select>
        <select
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          className="h-11 rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-base"
        >
          <option value="todos">Cliente: todos</option>
          {clients.map((client) => (
            <option key={client} value={client}>
              {client}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111827]">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-zinc-300">No hay tareas para este filtro.</p>
        ) : (
          <table className="w-full text-left text-base">
            <thead className="border-b border-zinc-700 text-zinc-300">
              <tr>
                <th className="px-4 py-4 font-medium">Titulo</th>
                <th className="px-4 py-4 font-medium">Cliente</th>
                <th className="px-4 py-4 font-medium">Estado</th>
                <th className="px-4 py-4 font-medium">Deadline</th>
                <th className="px-4 py-4 font-medium">Prioridad</th>
                <th className="px-4 py-4 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => (
                <tr key={task.id} className="border-b border-zinc-800 align-top">
                  <td className="px-4 py-4">{task.title}</td>
                  <td className="px-4 py-4">{task.clientName}</td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-sm ${statusBadge(task.status)}`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {task.deadlineAt ? new Date(task.deadlineAt).toLocaleString("es-AR") : "Sin deadline"}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-sm ${priorityBadge(task.priority)}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <EditorTaskActions
                      taskId={task.id}
                      assignmentId={task.assignmentId}
                      pendingAcceptance={task.pendingAcceptance}
                      canDeliver={task.canDeliver}
                      campaignPendingAcceptance={task.pendingAcceptance && Boolean(task.campaignId)}
                    />
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
