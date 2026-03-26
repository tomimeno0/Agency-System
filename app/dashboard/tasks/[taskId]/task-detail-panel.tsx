"use client";

import { AssignmentStatus } from "@prisma/client";
import { useMemo } from "react";

type Props = {
  assignments: Array<{
    id: string;
    editorId: string;
    editorName: string;
    status: AssignmentStatus;
    assignedAt: string;
    acceptedAt: string | null;
  }>;
};

function assignmentStatusLabel(status: AssignmentStatus): string {
  if (status === AssignmentStatus.ASSIGNED) return "Asignada";
  if (status === AssignmentStatus.ACCEPTED) return "Aceptada";
  if (status === AssignmentStatus.REJECTED) return "Rechazada";
  if (status === AssignmentStatus.COMPLETED) return "Completada";
  if (status === AssignmentStatus.CANCELLED) return "Cancelada";
  return "Expirada";
}

export function TaskDetailPanel({ assignments }: Props) {
  const sortedAssignments = useMemo(
    () =>
      [...assignments].sort(
        (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
      ),
    [assignments],
  );

  return (
    <aside className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Asignaciones</h2>
        {sortedAssignments.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin asignaciones.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {sortedAssignments.map((assignment) => (
              <li key={assignment.id} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                <p>{assignment.editorName}</p>
                <p className="text-xs text-zinc-400">
                  {assignmentStatusLabel(assignment.status)} - {new Date(assignment.assignedAt).toLocaleString("es-AR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-2 text-lg font-semibold">Modo detalle</h2>
        <p className="text-sm text-zinc-400">
          Esta vista es solo lectura. Para reasignar editor o editar configuracion de la tarea, usa el boton
          {" "}
          &quot;Editar&quot;
          {" "}
          en la tabla de Tasks.
        </p>
      </div>
    </aside>
  );
}
