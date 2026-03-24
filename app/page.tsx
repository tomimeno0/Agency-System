import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <header className="flex flex-col items-center pt-10">
        <h1 className="text-2xl font-semibold tracking-wide">EDITEX STUDIO</h1>
        <p className="mt-1 text-sm text-zinc-400">Video Editing Agency</p>
      </header>

      <section className="flex flex-1 items-center justify-center px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <Link
            href="/login"
            className="w-full rounded-md bg-white px-6 py-3 text-center text-base font-semibold text-black transition hover:bg-zinc-200"
          >
            Iniciar sesión
          </Link>

          <Link
            href="/register"
            className="w-full rounded-md border border-white px-6 py-3 text-center text-base font-medium text-white transition hover:bg-white hover:text-black"
          >
            Crear cuenta
          </Link>

          <p className="pt-2 text-sm text-zinc-400">— o —</p>

          <a
            href="https://wa.me/5491154662008?text=Hola,%20quiero%20postularme%20como%20editor%20en%20EDITEX%20STUDIO"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-md border border-zinc-600 px-6 py-3 text-center text-base font-medium text-white transition hover:border-zinc-400"
          >
            Quiero trabajar aquí
          </a>

          <a
            href="https://wa.me/5491154662008?text=Hola,%20necesito%20ayuda%20con%20la%20plataforma"
            target="_blank"
            rel="noopener noreferrer"
            className="pt-2 text-sm text-zinc-400 transition hover:text-zinc-200"
          >
            Soporte
          </a>
        </div>
      </section>
    </main>
  );
}
