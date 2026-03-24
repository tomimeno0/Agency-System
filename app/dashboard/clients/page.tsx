import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { fetchApiItems } from "@/app/dashboard/_lib/api";
import { authOptions } from "@/lib/auth/options";
import { ClientsManager } from "./clients-manager";

type ClientRow = {
  id: string;
  name: string;
  brandName: string | null;
  email: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export default async function ClientsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== Role.OWNER) {
    redirect("/dashboard");
  }

  const clients = await fetchApiItems<ClientRow>("/api/clients");
  return <ClientsManager initialClients={clients} />;
}
