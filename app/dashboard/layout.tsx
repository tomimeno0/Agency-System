import Link from "next/link";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { authOptions } from "@/lib/auth/options";
import { NotificationsPanel } from "./notifications-panel";
import { SessionCacheGuard } from "./session-cache-guard";

export const dynamic = "force-dynamic";

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
          { href: "/dashboard", label: "General" },
          ...(isOwner ? [{ href: "/dashboard/campaigns", label: "Campanas" }] : []),
          { href: "/dashboard/calendar", label: "Calendario" },
          { href: "/dashboard/clients", label: "Clientes" },
          { href: "/dashboard/workers", label: "Workers" },
          { href: "/dashboard/tasks", label: "Tareas" },
          { href: "/dashboard/review", label: "Revision" },
          { href: "/dashboard/deadlines", label: "Deadlines" },
          ...(isOwner ? [{ href: "/dashboard/finance", label: "Finanzas" }] : []),
          { href: "/dashboard/learning", label: "Learning" },
          { href: "/dashboard/security", label: "Seguridad" },
        ]
      : [
          { href: "/dashboard", label: "General" },
          { href: "/dashboard/calendar", label: "Calendario" },
          { href: "/dashboard/tasks", label: "Mis tareas" },
          { href: "/dashboard/submissions", label: "Entregas" },
          { href: "/dashboard/earnings", label: "Mis ingresos" },
          { href: "/dashboard/learning", label: "Learning" },
          { href: "/dashboard/account", label: "Cuenta" },
          { href: "/dashboard/security", label: "Seguridad" },
        ];

  return (
    <div className="min-h-screen bg-[#0b0f14] text-[#e5e7eb]">
      <SessionCacheGuard />
      <div className="flex w-full gap-5 px-2 py-5 md:gap-7 md:px-4 lg:px-5">
        <aside className="h-fit w-full rounded-xl border border-zinc-800 bg-[#111827] p-5 md:sticky md:top-5 md:w-72">
          <p className="mb-4 text-base font-semibold tracking-wide text-[#e5e7eb]">Dashboard</p>
          <div className="mb-4">
            <NotificationsPanel />
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2.5 text-base text-zinc-200 transition hover:bg-zinc-800"
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
