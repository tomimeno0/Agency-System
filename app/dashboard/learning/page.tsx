import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { LearningManager } from "./learning-manager";

export default async function LearningPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const isOwner = session.user.role === Role.OWNER;
  const items = await prisma.learningResource.findMany({
    where: isOwner ? undefined : { isActive: true },
    orderBy: [{ level: "asc" }, { createdAt: "desc" }],
  });

  return <LearningManager initialItems={items} isOwner={isOwner} />;
}
