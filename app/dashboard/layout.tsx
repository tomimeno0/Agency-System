import Link from "next/link";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { authOptions } from "@/lib/auth/options";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  const isOwner = role === Role.OWNER;
  const isAdmin = role === Role.ADMIN;

  const navItems =
    isOwner || isAdmin
      ? [
          { href: "/dashboard", label: "Resumen" },
          { href: "/dashboard/clients", label: "Clientes" },
          { href: "/dashboard/workers", label: "Workers" },
          { href: "/dashboard/tasks", label: "Tareas" },
          { href: "/dashboard/deadlines", label: "Deadlines" },
          { href: "/dashboard/tasks/new", label: "Crear tarea" },
          ...(isOwner ? [{ href: "/dashboard/finance", label: "Finanzas" }] : []),
          { href: "/dashboard/learning", label: "Learning" },
          { href: "/dashboard/security", label: "Seguridad" },
        ]
      : [
          { href: "/dashboard", label: "Resumen" },
          { href: "/dashboard/tasks", label: "Mis tareas" },
          { href: "/dashboard/learning", label: "Learning" },
          { href: "/dashboard/security", label: "Seguridad" },
        ];

  return (
    <div className="min-h-screen bg-[#0b0f14] text-[#e5e7eb]">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 md:px-6">
        <aside className="h-fit w-full rounded-xl border border-zinc-800 bg-[#111827] p-4 md:sticky md:top-6 md:w-64">
          <p className="mb-4 text-sm font-semibold tracking-wide text-[#e5e7eb]">Dashboard</p>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </div>
  );
}
