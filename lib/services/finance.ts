import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { notFound, unprocessable } from "@/lib/http/errors";

function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

export async function calculateEarningForAssignment(input: {
  taskAssignmentId: string;
  editorPercentage: number;
  agencyPercentage: number;
  currency?: string;
  initialStatus?: PaymentStatus;
  approvedById?: string;
}) {
  const assignment = await prisma.taskAssignment.findUnique({
    where: { id: input.taskAssignmentId },
    include: {
      task: {
        include: {
          project: true,
          client: true,
          campaign: true,
        },
      },
    },
  });

  if (!assignment) {
    notFound("Task assignment not found");
  }

  if (input.editorPercentage + input.agencyPercentage > 100) {
    unprocessable("editorPercentage + agencyPercentage cannot exceed 100");
  }

  const campaignPriceRaw = assignment.task.campaign?.pricePerVideo;
  const packPriceRaw = assignment.task.project?.packPrice ?? assignment.task.client?.packPrice;
  const packSizeRaw = assignment.task.project?.packSize ?? assignment.task.client?.packSize;

  let baseValue = 0;
  if (campaignPriceRaw) {
    // Campaign tasks are unitary (1 video per generated task).
    baseValue = Number(campaignPriceRaw);
  } else {
    const packSize = packSizeRaw ?? 0;
    if (!packPriceRaw || packSize <= 0) {
      unprocessable("Task requires campaign pricePerVideo or client/project packPrice and packSize");
    }
    const packPrice = Number(packPriceRaw);
    baseValue = packPrice / packSize;
  }

  const assignmentPercentage = Number(assignment.percentageOfTask) / 100;
  const grossAmount = baseValue * assignmentPercentage;
  const editorNetAmount = grossAmount * (input.editorPercentage / 100);
  const agencyCommissionAmount = grossAmount * (input.agencyPercentage / 100);

  const nextStatus = input.initialStatus ?? PaymentStatus.CALCULATED;
  const approvedAt = nextStatus === PaymentStatus.APPROVED || nextStatus === PaymentStatus.PAID ? new Date() : null;
  const paidAt = nextStatus === PaymentStatus.PAID ? new Date() : null;

  const earning = await prisma.editorEarning.upsert({
    where: { taskAssignmentId: assignment.id },
    create: {
      taskAssignmentId: assignment.id,
      editorId: assignment.editorId,
      baseValue: toMoney(baseValue),
      editorPercentage: toMoney(input.editorPercentage),
      agencyPercentage: toMoney(input.agencyPercentage),
      assignmentPercentage: toMoney(Number(assignment.percentageOfTask)),
      grossAmount: toMoney(grossAmount),
      agencyCommissionAmount: toMoney(agencyCommissionAmount),
      editorNetAmount: toMoney(editorNetAmount),
      currency:
        input.currency ??
        assignment.task.campaign?.currency ??
        assignment.task.project?.currency ??
        env.DEFAULT_CURRENCY,
      status: nextStatus,
      calculatedAt: new Date(),
      approvedAt,
      approvedById: input.approvedById ?? null,
      paidAt,
    },
    update: {
      baseValue: toMoney(baseValue),
      editorPercentage: toMoney(input.editorPercentage),
      agencyPercentage: toMoney(input.agencyPercentage),
      assignmentPercentage: toMoney(Number(assignment.percentageOfTask)),
      grossAmount: toMoney(grossAmount),
      agencyCommissionAmount: toMoney(agencyCommissionAmount),
      editorNetAmount: toMoney(editorNetAmount),
      currency:
        input.currency ??
        assignment.task.campaign?.currency ??
        assignment.task.project?.currency ??
        env.DEFAULT_CURRENCY,
      status: nextStatus,
      calculatedAt: new Date(),
      submittedForApprovalAt: nextStatus === PaymentStatus.PENDING_OWNER_APPROVAL ? new Date() : null,
      approvedAt,
      paidAt,
      approvedById: input.approvedById ?? null,
    },
  });

  return earning;
}

const DEFAULT_EDITOR_PERCENTAGE = 60;
const DEFAULT_AGENCY_PERCENTAGE = 40;

export async function createApprovedEarningForAssignment(input: {
  taskAssignmentId: string;
  approvedById: string;
  currency?: string;
}) {
  return calculateEarningForAssignment({
    taskAssignmentId: input.taskAssignmentId,
    editorPercentage: DEFAULT_EDITOR_PERCENTAGE,
    agencyPercentage: DEFAULT_AGENCY_PERCENTAGE,
    currency: input.currency ?? "ARS",
    initialStatus: PaymentStatus.APPROVED,
    approvedById: input.approvedById,
  });
}
