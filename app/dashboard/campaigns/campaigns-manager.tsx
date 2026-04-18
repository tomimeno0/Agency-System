"use client";

import { CampaignBillingStatus, CampaignPlanPreset, CampaignStatus } from "@prisma/client";
import { useMemo, useState } from "react";

type ClientOption = {
  id: string;
  name: string;
  brandName: string | null;
};

type EditorOption = {
  id: string;
  displayName: string;
  email: string;
};

type CampaignRow = {
  id: string;
  name: string;
  planPreset: CampaignPlanPreset;
  videosPerCycle: number;
  pricePerVideo: number | string;
  currency: string;
  startDate: string | Date;
  leadDays: number;
  defaultEditorId: string | null;
  status: CampaignStatus;
  billingStatus: CampaignBillingStatus;
  publishedAt: string | Date | null;
  client: {
    id: string;
    name: string;
    brandName: string | null;
  };
  defaultEditor: {
    id: string;
    displayName: string;
  } | null;
  _count: {
    tasks: number;
  };
};

type CampaignForm = {
  name: string;
  clientId: string;
  planPreset: CampaignPlanPreset;
  videosPerCycle: string;
  pricePerVideo: string;
  startDate: string;
  leadDays: string;
  defaultEditorId: string;
};

export function CampaignsManager({
  initialCampaigns,
  clients,
  editors,
}: {
  initialCampaigns: CampaignRow[];
  clients: ClientOption[];
  editors: EditorOption[];
}) {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>(initialCampaigns);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [form, setForm] = useState<CampaignForm>({
    name: "",
    clientId: clients[0]?.id ?? "",
    planPreset: CampaignPlanPreset.PLAN_12,
    videosPerCycle: "12",
    pricePerVideo: "0",
    startDate: new Date().toISOString().slice(0, 16),
    leadDays: "1",
    defaultEditorId: "",
  });

  const visibleVideos = useMemo(() => {
    if (form.planPreset === CampaignPlanPreset.PLAN_12) return 12;
    if (form.planPreset === CampaignPlanPreset.PLAN_20) return 20;
    if (form.planPreset === CampaignPlanPreset.PLAN_30) return 30;
    const parsed = Number(form.videosPerCycle);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [form.planPreset, form.videosPerCycle]);

  const pricePerVideo = useMemo(() => {
    const parsed = Number(form.pricePerVideo);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [form.pricePerVideo]);

  const estimatedTotal = useMemo(() => visibleVideos * pricePerVideo, [pricePerVideo, visibleVideos]);

  function onPlanPresetChange(nextPreset: CampaignPlanPreset) {
    setForm((prev) => {
      if (nextPreset === CampaignPlanPreset.PLAN_12) {
        return { ...prev, planPreset: nextPreset, videosPerCycle: "12" };
      }
      if (nextPreset === CampaignPlanPreset.PLAN_20) {
        return { ...prev, planPreset: nextPreset, videosPerCycle: "20" };
      }
      if (nextPreset === CampaignPlanPreset.PLAN_30) {
        return { ...prev, planPreset: nextPreset, videosPerCycle: "30" };
      }
      return { ...prev, planPreset: nextPreset };
    });
  }

  async function refreshCampaigns() {
    const response = await fetch("/api/campaigns", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { data?: { items?: CampaignRow[] } };
    const next = payload.data?.items;
    if (next) {
      setCampaigns(next);
    }
  }

  async function uploadCampaignFile(campaignId: string, file: File) {
    const uploadUrlResponse = await fetch("/api/files/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    });
    if (!uploadUrlResponse.ok) {
      throw new Error(`No se pudo generar URL de subida para ${file.name}.`);
    }

    const uploadPayload = (await uploadUrlResponse.json()) as {
      data: { storageKey: string; uploadUrl: string };
    };

    const putResponse = await fetch(uploadPayload.data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putResponse.ok) {
      throw new Error(`No se pudo subir ${file.name}.`);
    }

    const finalizeResponse = await fetch("/api/files/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        storageKey: uploadPayload.data.storageKey,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    });
    if (!finalizeResponse.ok) {
      throw new Error(`No se pudo registrar el bruto ${file.name}.`);
    }
  }

  async function createCampaign() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          clientId: form.clientId,
          planPreset: form.planPreset,
          videosPerCycle: visibleVideos,
          pricePerVideo,
          currency: "ARS",
          startDate: new Date(form.startDate).toISOString(),
          leadDays: Number(form.leadDays),
          defaultEditorId: form.defaultEditorId || undefined,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? "No se pudo crear la campana.");
      }
      const payload = (await response.json()) as { data?: { id?: string } };
      const campaignId = payload.data?.id;
      if (!campaignId) {
        throw new Error("La campana se creo sin id de respuesta.");
      }

      if (files?.length) {
        for (const file of Array.from(files)) {
          await uploadCampaignFile(campaignId, file);
        }
      }

      setMessage(
        files?.length
          ? `Campana creada con ${files.length} bruto(s) cargado(s).`
          : "Campana creada.",
      );
      setForm((prev) => ({ ...prev, name: "" }));
      setFiles(null);
      setFileInputKey((prev) => prev + 1);
      await refreshCampaigns();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error creando campana.");
    } finally {
      setSaving(false);
    }
  }

  async function publishCampaign(campaignId: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRepublish: false }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? "No se pudo publicar la campana.");
      }
      setMessage("Campana publicada y tareas generadas.");
      await refreshCampaigns();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Error publicando campana.");
    } finally {
      setSaving(false);
    }
  }

  async function updateBillingStatus(campaignId: string, billingStatus: CampaignBillingStatus) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/billing-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingStatus }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? "No se pudo actualizar el cobro.");
      }
      setMessage("Estado de cobro actualizado.");
      await refreshCampaigns();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Error actualizando cobro.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCampaign(campaignId: string, campaignName: string) {
    const confirmed = window.confirm(
      `Vas a eliminar la campana "${campaignName}" y sus tareas generadas. Esta accion no se puede deshacer.\n\n¿Continuar?`,
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? "No se pudo eliminar la campana.");
      }
      setMessage("Campana eliminada.");
      await refreshCampaigns();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Error eliminando campana.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold">Campanas</h1>
        <p className="text-sm text-zinc-400">
          Planifica ciclos mensuales, genera tareas automaticamente y registra el cobro administrativo.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Crear campana</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-400">Nombre de campana</span>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Ej: Abril - Fly-Half"
              className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            />
            <span className="text-[11px] text-zinc-500">Nombre interno para identificar el ciclo.</span>
          </label>

          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-400">Cliente</span>
            <select
              value={form.clientId}
              onChange={(event) => setForm((prev) => ({ ...prev, clientId: event.target.value }))}
              className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.brandName ?? client.name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-zinc-500">Marca o cuenta para la que se produce este ciclo.</span>
          </label>

          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-400">Plan de videos</span>
            <select
              value={form.planPreset}
              onChange={(event) => onPlanPresetChange(event.target.value as CampaignPlanPreset)}
              className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            >
              <option value={CampaignPlanPreset.PLAN_12}>Plan 12 videos/mes</option>
              <option value={CampaignPlanPreset.PLAN_20}>Plan 20 videos/mes</option>
              <option value={CampaignPlanPreset.PLAN_30}>Plan 30 videos/mes</option>
              <option value={CampaignPlanPreset.CUSTOM}>Plan personalizado</option>
            </select>
            <span className="text-[11px] text-zinc-500">Selecciona 12, 20, 30 o personalizado.</span>
          </label>

          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-400">Cantidad de videos</span>
            <input
              type="number"
              min={1}
              value={form.videosPerCycle}
              onChange={(event) => setForm((prev) => ({ ...prev, videosPerCycle: event.target.value }))}
              disabled={form.planPreset !== CampaignPlanPreset.CUSTOM}
              className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm disabled:opacity-60"
              placeholder="Videos por ciclo"
            />
            <span className="text-[11px] text-zinc-500">
              {form.planPreset === CampaignPlanPreset.CUSTOM
                ? "Define cuantos videos se producen en el ciclo."
                : `El plan define automaticamente ${visibleVideos} videos.`}
            </span>
          </label>

          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-400">Precio por video (ARS)</span>
            <input
              type="number"
              min={1}
              value={form.pricePerVideo}
              onChange={(event) => setForm((prev) => ({ ...prev, pricePerVideo: event.target.value }))}
              className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
              placeholder="Ej: 7000"
            />
            <span className="text-[11px] text-zinc-500">Monto administrativo por cada video de esta campana.</span>
          </label>

          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-400">Inicio de ciclo</span>
            <input
              type="datetime-local"
              value={form.startDate}
              onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
              className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            />
            <span className="text-[11px] text-zinc-500">Desde esta fecha se planifican las entregas.</span>
          </label>

          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-400">Margen de entrega (dias)</span>
            <input
              type="number"
              min={0}
              max={15}
              value={form.leadDays}
              onChange={(event) => setForm((prev) => ({ ...prev, leadDays: event.target.value }))}
              className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
              placeholder="Ej: 1"
            />
            <span className="text-[11px] text-zinc-500">Dias de anticipacion entre deadline interno y publicacion.</span>
          </label>

          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-400">Editor preasignado (opcional)</span>
            <select
              value={form.defaultEditorId}
              onChange={(event) => setForm((prev) => ({ ...prev, defaultEditorId: event.target.value }))}
              className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            >
              <option value="">Sin editor preasignado</option>
              {editors.map((editor) => (
                <option key={editor.id} value={editor.id}>
                  {editor.displayName}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-zinc-500">Si lo dejas vacio, las tareas salen sin asignar.</span>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs uppercase tracking-wide text-zinc-400">Brutos de la campana</span>
            <input
              key={fileInputKey}
              type="file"
              multiple
              onChange={(event) => setFiles(event.target.files)}
              className="w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm"
            />
            <span className="text-[11px] text-zinc-500">
              Sube los videos brutos ahora. Al publicar, se asignan en orden a Video 1, Video 2, etc.
            </span>
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
            <p className="text-xs text-zinc-400">Videos del ciclo</p>
            <p className="text-lg font-semibold text-white">{visibleVideos}</p>
          </div>
          <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
            <p className="text-xs text-zinc-400">Brutos seleccionados</p>
            <p className="text-lg font-semibold text-white">{files?.length ?? 0}</p>
          </div>
          <div className="rounded-md border border-emerald-800 bg-emerald-950/20 px-3 py-2">
            <p className="text-xs text-emerald-300">Precio total estimado de campana</p>
            <p className="text-lg font-semibold text-emerald-100">${estimatedTotal.toLocaleString("es-AR")} ARS</p>
          </div>
        </div>
        <button
          type="button"
          onClick={createCampaign}
          disabled={saving || !form.name.trim() || !form.clientId || visibleVideos <= 0 || pricePerVideo <= 0}
          className="mt-3 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Crear campana"}
        </button>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111827]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-700 text-zinc-300">
            <tr>
              <th className="px-4 py-3 font-medium">Campana</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Precio/video</th>
              <th className="px-4 py-3 font-medium">Total ciclo</th>
              <th className="px-4 py-3 font-medium">Editor</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Cobro</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-4 text-zinc-400">
                  Todavia no hay campanas.
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-zinc-800">
                  <td className="px-4 py-3">
                    <p className="font-medium">{campaign.name}</p>
                    <p className="text-xs text-zinc-400">{campaign._count.tasks} tareas</p>
                  </td>
                  <td className="px-4 py-3">{campaign.client.brandName ?? campaign.client.name}</td>
                  <td className="px-4 py-3">{campaign.videosPerCycle} videos</td>
                  <td className="px-4 py-3">${Number(campaign.pricePerVideo).toFixed(2)} ARS</td>
                  <td className="px-4 py-3">${(Number(campaign.pricePerVideo) * campaign.videosPerCycle).toFixed(2)} ARS</td>
                  <td className="px-4 py-3">{campaign.defaultEditor?.displayName ?? "Sin editor"}</td>
                  <td className="px-4 py-3">{toHumanCampaignStatus(campaign.status)}</td>
                  <td className="px-4 py-3">
                    <select
                      value={campaign.billingStatus}
                      onChange={(event) =>
                        updateBillingStatus(campaign.id, event.target.value as CampaignBillingStatus)
                      }
                      className="rounded-md border border-zinc-700 bg-[#0b0f14] px-2 py-1 text-xs"
                    >
                      <option value={CampaignBillingStatus.PENDING_COLLECTION}>Pendiente</option>
                      <option value={CampaignBillingStatus.COLLECTED}>Cobrado</option>
                      <option value={CampaignBillingStatus.CANCELLED}>Cancelado</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => publishCampaign(campaign.id)}
                        disabled={saving || campaign.status === CampaignStatus.PUBLISHED}
                        className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-800 disabled:opacity-60"
                      >
                        {campaign.status === CampaignStatus.PUBLISHED ? "Publicada" : "Publicar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCampaign(campaign.id, campaign.name)}
                        disabled={saving}
                        className="rounded-md border border-red-700 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-60"
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
      </section>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
    </main>
  );
}

function toHumanCampaignStatus(status: CampaignStatus): string {
  if (status === CampaignStatus.DRAFT) return "Borrador";
  if (status === CampaignStatus.PUBLISHED) return "Publicada";
  if (status === CampaignStatus.PAUSED) return "Pausada";
  if (status === CampaignStatus.CLOSED) return "Cerrada";
  return "Cancelada";
}
