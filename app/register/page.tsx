import { SystemAssignmentMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
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

  return <RegisterForm signupOpen={config.editorSignupOpen} />;
}
