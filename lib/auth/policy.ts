import { AssignmentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidden } from "@/lib/http/errors";
import type { SessionUser } from "@/lib/auth/session";

export function isPrivilegedRole(role: Role): boolean {
  return role === Role.OWNER || role === Role.ADMIN;
}

export function assertCanManageTargetRole(actor: SessionUser, targetRole: Role): void {
  if (actor.role === Role.OWNER) return;
  if (actor.role === Role.ADMIN && targetRole === Role.EDITOR) return;
  forbidden("No tienes permisos para esta operacion");
}

export async function assertTaskOwnershipAccess(actor: SessionUser, taskId: string): Promise<void> {
  if (isPrivilegedRole(actor.role)) return;
  if (actor.role !== Role.EDITOR) forbidden("No autorizado");

  const match = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [
        { directEditorId: actor.id },
        {
          assignments: {
            some: {
              editorId: actor.id,
              status: {
                in: [
                  AssignmentStatus.ASSIGNED,
                  AssignmentStatus.ACCEPTED,
                  AssignmentStatus.COMPLETED,
                ],
              },
            },
          },
        },
      ],
    },
    select: { id: true },
  });

  if (!match) {
    forbidden("No puedes acceder a esta tarea");
  }
}

export async function assertAssignmentOwnershipAccess(actor: SessionUser, assignmentId: string): Promise<void> {
  if (isPrivilegedRole(actor.role)) return;
  if (actor.role !== Role.EDITOR) forbidden("No autorizado");

  const assignment = await prisma.taskAssignment.findUnique({
    where: { id: assignmentId },
    select: { editorId: true },
  });

  if (!assignment || assignment.editorId !== actor.id) {
    forbidden("No puedes acceder a esta asignacion");
  }
}

