import { TaskAssignmentFlowStatus, TaskPriority, TaskState } from "@prisma/client";

export type HumanTaskStage =
  | "Sin asignar"
  | "Esperando aceptacion"
  | "En edicion"
  | "En revision"
  | "Completada";

export function toHumanPriority(priority: TaskPriority): "Alta" | "Media" | "Baja" {
  if (priority === TaskPriority.URGENT || priority === TaskPriority.HIGH) return "Alta";
  if (priority === TaskPriority.MEDIUM) return "Media";
  return "Baja";
}

export function toHumanTaskStage(input: {
  state: TaskState;
  assignmentFlowStatus: TaskAssignmentFlowStatus;
  hasEditor: boolean;
}): HumanTaskStage {
  if (!input.hasEditor || input.state === TaskState.PENDING_ASSIGNMENT) return "Sin asignar";
  if (
    input.assignmentFlowStatus === TaskAssignmentFlowStatus.PENDING_OFFER ||
    input.state === TaskState.OFFERED
  ) {
    return "Esperando aceptacion";
  }
  switch (input.state) {
    case TaskState.ACCEPTED:
    case TaskState.IN_EDITING:
    case TaskState.NEEDS_CORRECTION:
      return "En edicion";
    case TaskState.UPLOADED:
    case TaskState.IN_REVIEW:
      return "En revision";
    default:
      return "Completada";
  }
}

export function isCompletedState(state: TaskState): boolean {
  return (
    state === TaskState.APPROVED ||
    state === TaskState.DELIVERED ||
    state === TaskState.CLOSED ||
    state === TaskState.CANCELLED
  );
}
