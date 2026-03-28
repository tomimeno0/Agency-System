import { Role, SystemAssignmentMode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { SecurityManager } from "./security-manager";

export default async function SecurityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const config = await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      assignmentMode: SystemAssignmentMode.AUTOMATIC,
      darkModeEnabled: true,
      editorSignupOpen: true,
    },
    select: { editorSignupOpen: true },
  });

  const canManageSignup = session.user.role === Role.OWNER;
  return (
    <SecurityManager
      canManageSignup={canManageSignup}
      initialSignupOpen={config.editorSignupOpen}
    />
  );
}
