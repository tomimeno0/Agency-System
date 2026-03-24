import Link from "next/link";

export default function Home() {
  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(80rem_50rem_at_20%_-10%,#dbeafe_0%,#f8fafc_55%,#ffffff_100%)]">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
        <header className="flex items-center justify-between py-3">
          <div className="text-lg font-semibold tracking-tight">AgencyOS</div>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Iniciar sesión
            </Link>
          </nav>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 md:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Plataforma interna de operación
            </p>
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 md:text-5xl">
              Operá clientes, tareas y pagos en un único sistema de agencia.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-700">
              V1 enfocada en ejecución real: usuarios con roles estrictos, flujo de entregas y revisión,
              cálculo financiero auditado y aprendizaje básico para editores.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Entrar al sistema
              </Link>
              <a
                href="#como-funciona"
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cómo funciona
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50">
            <h2 className="text-lg font-semibold">MVP v1 (incluido)</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li>Autenticación con roles: owner, admin, editor</li>
              <li>Clientes internos, proyectos, tareas y asignaciones</li>
              <li>Entregas, QA, correcciones y cierre</li>
              <li>Cálculo de pagos + aprobación owner</li>
              <li>Auditoría, learning básico y notificaciones in-app</li>
            </ul>

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Fuera de v1</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-600">
              <li>Portal cliente con login</li>
              <li>WhatsApp API y automatizaciones complejas</li>
              <li>IA con memoria persistente</li>
            </ul>
          </div>
        </section>

        <section id="como-funciona" className="py-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Flujo operativo</h2>
            <p className="mt-3 text-sm text-slate-700">
              Admin crea proyecto/tarea, asigna editor, editor entrega, QA revisa, se aprueba y se liquida con trazabilidad completa.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
