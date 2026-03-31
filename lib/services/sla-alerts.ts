import { AssignmentStatus, NotificationType, Role, TaskState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isCompletedState } from "@/lib/presentation/tasks";
import type { SessionUser } from "@/lib/auth/session";
import { createNotification } from "@/lib/services/notifications";

type Severity = "24h" | "6h" | "overdue";

function detectSeverity(deadlineAt: Date, now: Date): Severity | null {
  const deltaMs = deadlineAt.getTime() - now.getTime();
  if (deltaMs <= 0) return "overdue";
  if (deltaMs <= 6 * 60 * 60 * 1000) return "6h";
  if (deltaMs <= 24 * 60 * 60 * 1000) return "24h";
  return null;
}

function titleForSeverity(severity: Severity): string {
  if (severity === "overdue") return "SLA: tarea vencida";
  if (severity === "6h") return "SLA: vence en menos de 6h";
  return "SLA: vence en menos de 24h";
}

function messageForSeverity(severity: Severity, taskTitle: string): string {
  if (severity === "overdue") return `La tarea "${taskTitle}" ya está vencida.`;
  if (severity === "6h") return `La tarea "${taskTitle}" vence en menos de 6 horas.`;
  return `La tarea "${taskTitle}" vence en menos de 24 horas.`;
}

async function sendSlaNotification(input: {
  userId: string;
  severity: Severity;
  taskId: string;
  taskTitle: string;
  deadlineAt: Date;
  now: Date;
}) {
  const title = titleForSeverity(input.severity);
  const recent = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      type: input.severity === "overdue" ? NotificationType.TASK_OVERDUE : NotificationType.REMINDER,
      title,
      createdAt: { gte: new Date(input.now.getTime() - 3 * 60 * 60 * 1000) },
      metadataJson: {
        path: ["taskId"],
        equals: input.taskId,
      },
    },
    select: { id: true },
  });

  if (recent) return;

  await createNotification({
    userId: input.userId,
    type: input.severity === "overdue" ? NotificationType.TASK_OVERDUE : NotificationType.REMINDER,
    title,
    message: messageForSeverity(input.severity, input.taskTitle),
    metadataJson: {
      taskId: input.taskId,
      severity: input.severity,
      deadlineAt: input.deadlineAt.toISOString(),
    },
  });
}

export async function evaluateSlaAlertsForUser(actor: SessionUser): Promise<void> {
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where:
      actor.role === Role.EDITOR
        ? {
            OR: [
              { directEditorId: actor.id },
              {
                assignments: {
                  some: {
                    editorId: actor.id,
                    status: {
                      in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED],
                    },
                  },
                },
              },
            ],
            deadlineAt: { not: null },
          }
        : {
            deadlineAt: { not: null },
            state: { notIn: [TaskState.CANCELLED, TaskState.CLOSED] },
          },
    select: {
      id: true,
      title: true,
      state: true,
      deadlineAt: true,
      createdById: true,
      directEditorId: true,
      assignments: {
        where: {
          status: { in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED] },
        },
        select: { editorId: true },
      },
    },
    take: 1200,
  });

  for (const task of tasks) {
    if (!task.deadlineAt || isCompletedState(task.state)) continue;
    const severity = detectSeverity(task.deadlineAt, now);
    if (!severity) continue;

    const recipients = new Set<string>();
    if (actor.role === Role.EDITOR) {
      recipients.add(actor.id);
    } else {
      recipients.add(actor.id);
      if (task.directEditorId) recipients.add(task.directEditorId);
      for (const assignment of task.assignments) {
        recipients.add(assignment.editorId);
      }
    }

    for (const userId of recipients) {
      await sendSlaNotification({
        userId,
        severity,
        taskId: task.id,
        taskTitle: task.title,
        deadlineAt: task.deadlineAt,
        now,
      });
    }
  }
}

