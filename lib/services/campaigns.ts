import { CampaignPlanPreset } from "@prisma/client";

export function normalizeVideosPerCycle(planPreset: CampaignPlanPreset, videosPerCycle: number): number {
  if (planPreset === CampaignPlanPreset.PLAN_12) return 12;
  if (planPreset === CampaignPlanPreset.PLAN_20) return 20;
  if (planPreset === CampaignPlanPreset.PLAN_30) return 30;
  return videosPerCycle;
}

export function buildCampaignSchedule(input: {
  startDate: Date;
  videosPerCycle: number;
  leadDays: number;
}): Array<{ videoIndex: number; publishAt: Date; deadlineAt: Date }> {
  const count = Math.max(1, Math.floor(input.videosPerCycle));
  const leadDaysMs = Math.max(0, input.leadDays) * 24 * 60 * 60 * 1000;
  const cycleStart = new Date(input.startDate);
  const cycleEnd = new Date(cycleStart);
  cycleEnd.setMonth(cycleEnd.getMonth() + 1);
  const totalSpanMs = Math.max(1, cycleEnd.getTime() - cycleStart.getTime());
  const stepMs = totalSpanMs / count;

  const result: Array<{ videoIndex: number; publishAt: Date; deadlineAt: Date }> = [];
  for (let index = 0; index < count; index += 1) {
    const publishAt = new Date(cycleStart.getTime() + stepMs * index);
    const rawDeadline = publishAt.getTime() - leadDaysMs;
    const deadlineAt = new Date(Math.max(rawDeadline, cycleStart.getTime()));
    result.push({
      videoIndex: index + 1,
      publishAt,
      deadlineAt,
    });
  }
  return result;
}

export function resolveBiweeklyRange(input: {
  now?: Date;
  year?: number;
  month?: number;
  half?: "first" | "second";
}): { start: Date; end: Date; label: string } {
  const now = input.now ?? new Date();
  const year = input.year ?? now.getFullYear();
  const month = input.month ?? now.getMonth() + 1;
  const half =
    input.half ??
    (now.getDate() <= 15 && now.getMonth() + 1 === month && now.getFullYear() === year
      ? "first"
      : "second");

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const firstHalfEnd = new Date(year, month - 1, 16, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 1, 0, 0, 0, 0);

  if (half === "first") {
    return {
      start: monthStart,
      end: firstHalfEnd,
      label: `${year}-${String(month).padStart(2, "0")} (1-15)`,
    };
  }

  return {
    start: firstHalfEnd,
    end: monthEnd,
    label: `${year}-${String(month).padStart(2, "0")} (16-fin)`,
  };
}
