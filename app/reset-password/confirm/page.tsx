import { ResetPasswordConfirmForm } from "./confirm-form";

export default async function ResetPasswordConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const tokenRaw = query.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] ?? "" : tokenRaw ?? "";

  return (
    <main className="min-h-screen w-full bg-[#0b0f14] px-6 py-16 text-[#e5e7eb]">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
        <h1 className="text-3xl font-semibold tracking-tight">Nueva contrasena</h1>
        <p className="mt-2 text-sm text-zinc-400">El enlace es valido por tiempo limitado</p>
        <ResetPasswordConfirmForm token={token} />
      </div>
    </main>
  );
}
