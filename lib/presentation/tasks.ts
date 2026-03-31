import { TaskAssignmentFlowStatus, TaskPriority, TaskState } from "@prisma/client";

export type HumanTaskStage =
  | "Sin asignar"
  | "Esperando aceptacion"
  | "En edicion"
  | "Para revisar"
  | "Completada";

const TASK_STATE_LABELS: Record<TaskState, string> = {
  [TaskState.DRAFT]: "Borrador",
  [TaskState.PENDING_ASSIGNMENT]: "Pendiente de asignacion",
  [TaskState.OFFERED]: "Ofrecida",
  [TaskState.ACCEPTED]: "Aceptada",
  [TaskState.IN_EDITING]: "En edicion",
  [TaskState.UPLOADED]: "Subida",
  [TaskState.IN_REVIEW]: "En revision",
  [TaskState.NEEDS_CORRECTION]: "Requiere correccion",
  [TaskState.APPROVED]: "Aprobada",
  [TaskState.DELIVERED]: "Entregada",
  [TaskState.CLOSED]: "Cerrada",
  [TaskState.CANCELLED]: "Cancelada",
};

const SYSTEM_COMMENT_LABELS: Record<string, string> = {
  "Submission uploaded": "Entrega subida",
  "Auto-start editing before submission": "Puesta en edicion automatica antes de entregar",
  "Assignment accepted": "Tarea aceptada por el editor",
  "Assignment accepted and moved to editing": "Tarea aceptada y movida a edicion",
  "Task creada": "Tarea creada",
  "Manual assignment accepted from edit": "Reasignacion manual confirmada",
  "Manual assignment accepted from edit and moved to editing": "Reasignacion manual confirmada y movida a edicion",
  "Editor unassigned from edit": "Editor desasignado desde edicion",
  "Submission approved": "Entrega aprobada",
  "Submission requires correction": "Entrega devuelta para correccion",
};

export function toHumanPriority(priority: TaskPriority): "Alta" | "Media" | "Baja" {
  if (priority === TaskPriority.URGENT || priority === TaskPriority.HIGH) return "Alta";
  if (priority === TaskPriority.MEDIUM) return "Media";
  return "Baja";
}

export function toHumanTaskState(state: TaskState | null): string {
  if (!state) return "Inicio";
  return TASK_STATE_LABELS[state] ?? state;
}

export function toHumanTaskHistoryComment(comment: string | null): string | null {
  if (!comment) return null;
  const normalized = comment.trim();
  return SYSTEM_COMMENT_LABELS[normalized] ?? normalized;
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
    case TaskState.IN_REVIEW:
    case TaskState.UPLOADED:
      return "Para revisar";
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
