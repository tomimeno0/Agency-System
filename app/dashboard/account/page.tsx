import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.EDITOR) redirect("/dashboard");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      displayName: true,
      email: true,
      fullName: true,
      country: true,
      timezone: true,
    },
  });

  if (!user) redirect("/dashboard");

  return <AccountForm user={user} />;
}
