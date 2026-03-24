import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { fetchApiItems } from "@/app/dashboard/_lib/api";
import { authOptions } from "@/lib/auth/options";
import { WorkersManager } from "./workers-manager";

type WorkerRow = {
  id: string;
  displayName: string;
  email: string;
  createdAt: string;
  role?: string;
  status?: "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE" | "LOCKED";
  workloadScore?: number;
  acceptanceRate?: number;
};

export default async function WorkersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== Role.OWNER) {
    redirect("/dashboard");
  }

  const workers = await fetchApiItems<WorkerRow>("/api/users");
  const canManage = true;

  return <WorkersManager initialWorkers={workers} canManage={canManage} />;
}
