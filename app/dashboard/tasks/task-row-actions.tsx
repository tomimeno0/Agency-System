"use client";

import Link from "next/link";
import { ArchiveTaskButton } from "./archive-task-button";
import { DeleteTaskButton } from "./delete-task-button";

type Props = {
  taskId: string;
  canManage: boolean;
  canDelete: boolean;
  canArchive: boolean;
};
export function TaskRowActions({ taskId, canManage, canDelete, canArchive }: Props) {
  return (
    <div className="min-w-[320px] space-y-2.5">
      <div className="flex flex-wrap gap-2.5">
        <Link
          href={`/dashboard/tasks/${taskId}`}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
        >
          Ver detalle
        </Link>
        {canManage ? (
          <Link
            href={`/dashboard/tasks/${taskId}/edit`}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            Editar
          </Link>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex items-center gap-2.5">
          {canArchive ? <ArchiveTaskButton taskId={taskId} /> : null}
          {canDelete ? <DeleteTaskButton taskId={taskId} /> : null}
        </div>
      ) : null}
    </div>
  );
}
