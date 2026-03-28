"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TaskItem = {
  id: string;
  title: string;
  clientName: string;
};

type Folder = {
  id: string;
  name: string;
  taskIds: string[];
};

type Props = {
  storageScope: string;
  tasks: TaskItem[];
};

function storageKey(scope: string): string {
  return `editor-project-folders:${scope}`;
}

function createFolderId(): string {
  return `folder_${Math.random().toString(36).slice(2, 10)}`;
}

export function ProjectsManager({ storageScope, tasks }: Props) {
  const [folderName, setFolderName] = useState("");
  const [folders, setFolders] = useState<Folder[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(storageKey(storageScope));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as Folder[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey(storageScope), JSON.stringify(folders));
  }, [folders, storageScope]);

  const taskFolderMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of folders) {
      for (const taskId of folder.taskIds) {
        map.set(taskId, folder.id);
      }
    }
    return map;
  }, [folders]);

  function createFolder() {
    const trimmed = folderName.trim();
    if (!trimmed) return;
    setFolders((current) => [
      {
        id: createFolderId(),
        name: trimmed,
        taskIds: [],
      },
      ...current,
    ]);
    setFolderName("");
  }

  function deleteFolder(folderId: string) {
    setFolders((current) => current.filter((folder) => folder.id !== folderId));
  }

  function assignTask(taskId: string, nextFolderId: string) {
    setFolders((current) =>
      current.map((folder) => {
        const withoutTask = folder.taskIds.filter((id) => id !== taskId);
        if (folder.id === nextFolderId) {
          return { ...folder, taskIds: [...withoutTask, taskId] };
        }
        return { ...folder, taskIds: withoutTask };
      }),
    );
  }

  function unassignTask(taskId: string) {
    setFolders((current) =>
      current.map((folder) => ({
        ...folder,
        taskIds: folder.taskIds.filter((id) => id !== taskId),
      })),
    );
  }

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-3xl font-semibold">Proyectos</h1>
        <p className="text-base text-zinc-400">Organiza tus tareas en carpetas simples.</p>
      </header>

      <section className="mb-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Crear carpeta</h2>
        <div className="flex gap-2">
          <input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            className="h-11 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm"
            placeholder="Nombre de carpeta (ej: Cliente A)"
          />
          <button
            type="button"
            onClick={createFolder}
            className="h-11 rounded-md border border-zinc-700 bg-zinc-900 px-4 text-sm hover:bg-zinc-800"
          >
            Crear
          </button>
        </div>
      </section>

      <section className="mb-5 grid gap-3 md:grid-cols-2">
        {folders.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
            <p className="text-sm text-zinc-400">Todavia no creaste carpetas.</p>
          </div>
        ) : (
          folders.map((folder) => (
            <article key={folder.id} className="rounded-xl border border-zinc-800 bg-[#111827] p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{folder.name}</h3>
                <button
                  type="button"
                  onClick={() => deleteFolder(folder.id)}
                  className="rounded-md border border-red-700 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/30"
                >
                  Eliminar
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                {folder.taskIds.length} tareas
              </p>
            </article>
          ))
        )}
      </section>

      <section className="mb-5 rounded-xl border border-zinc-800 bg-[#111827] p-4">
        <h2 className="mb-3 text-lg font-semibold">Agrupar tareas</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-zinc-400">No hay tareas para agrupar.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const selectedFolderId = taskFolderMap.get(task.id) ?? "";
              return (
                <div
                  key={task.id}
                  className="grid gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 md:grid-cols-[1fr_220px_auto]"
                >
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-zinc-400">{task.clientName}</p>
                  </div>
                  <select
                    value={selectedFolderId}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) {
                        unassignTask(task.id);
                        return;
                      }
                      assignTask(task.id, value);
                    }}
                    className="h-9 rounded-md border border-zinc-700 bg-[#0b0f14] px-2 text-sm"
                  >
                    <option value="">Sin carpeta</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  <Link
                    href={`/dashboard/tasks/${task.id}`}
                    className="h-9 rounded-md border border-zinc-700 px-3 text-center text-sm leading-9 hover:bg-zinc-800"
                  >
                    Ver
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
