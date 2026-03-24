import { TaskState } from "@prisma/client";
import { conflict } from "@/lib/http/errors";

const transitions: Record<TaskState, TaskState[]> = {
  [TaskState.DRAFT]: [TaskState.PENDING_ASSIGNMENT, TaskState.CANCELLED],
  [TaskState.PENDING_ASSIGNMENT]: [TaskState.OFFERED, TaskState.CANCELLED],
  [TaskState.OFFERED]: [TaskState.ACCEPTED, TaskState.PENDING_ASSIGNMENT, TaskState.CANCELLED],
  [TaskState.ACCEPTED]: [TaskState.IN_EDITING, TaskState.CANCELLED],
  [TaskState.IN_EDITING]: [TaskState.UPLOADED, TaskState.CANCELLED],
  [TaskState.UPLOADED]: [TaskState.IN_REVIEW, TaskState.NEEDS_CORRECTION, TaskState.APPROVED],
  [TaskState.IN_REVIEW]: [TaskState.NEEDS_CORRECTION, TaskState.APPROVED],
  [TaskState.NEEDS_CORRECTION]: [TaskState.IN_EDITING, TaskState.UPLOADED, TaskState.CANCELLED],
  [TaskState.APPROVED]: [TaskState.DELIVERED, TaskState.CLOSED],
  [TaskState.DELIVERED]: [TaskState.CLOSED],
  [TaskState.CLOSED]: [],
  [TaskState.CANCELLED]: [],
};

export function assertTaskTransitionAllowed(fromState: TaskState, toState: TaskState): void {
  if (fromState === toState) {
    return;
  }

  const allowed = transitions[fromState] ?? [];
  if (!allowed.includes(toState)) {
    conflict(`Transition from ${fromState} to ${toState} is not allowed`);
  }
}
