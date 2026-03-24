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
}) {
  const assignment = await prisma.taskAssignment.findUnique({
    where: { id: input.taskAssignmentId },
    include: {
      task: {
        include: {
          project: true,
          client: true,
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

  const packPriceRaw = assignment.task.project?.packPrice ?? assignment.task.client?.packPrice;
  const packSizeRaw = assignment.task.project?.packSize ?? assignment.task.client?.packSize;
  const packSize = packSizeRaw ?? 0;

  if (!packPriceRaw || packSize <= 0) {
    unprocessable("Task requires client/project packPrice and packSize greater than zero");
  }

  const packPrice = Number(packPriceRaw);
  const baseValue = packPrice / packSize;

  const assignmentPercentage = Number(assignment.percentageOfTask) / 100;
  const grossAmount = baseValue * assignmentPercentage;
  const editorNetAmount = grossAmount * (input.editorPercentage / 100);
  const agencyCommissionAmount = grossAmount * (input.agencyPercentage / 100);

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
      currency: input.currency ?? assignment.task.project?.currency ?? env.DEFAULT_CURRENCY,
      status: PaymentStatus.CALCULATED,
      calculatedAt: new Date(),
    },
    update: {
      baseValue: toMoney(baseValue),
      editorPercentage: toMoney(input.editorPercentage),
      agencyPercentage: toMoney(input.agencyPercentage),
      assignmentPercentage: toMoney(Number(assignment.percentageOfTask)),
      grossAmount: toMoney(grossAmount),
      agencyCommissionAmount: toMoney(agencyCommissionAmount),
      editorNetAmount: toMoney(editorNetAmount),
      currency: input.currency ?? assignment.task.project?.currency ?? env.DEFAULT_CURRENCY,
      status: PaymentStatus.CALCULATED,
      calculatedAt: new Date(),
      submittedForApprovalAt: null,
      approvedAt: null,
      paidAt: null,
      approvedById: null,
    },
  });

  return earning;
}
