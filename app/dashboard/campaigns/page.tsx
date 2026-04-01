import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db";
import { CampaignsManager } from "./campaigns-manager";

export default async function CampaignsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.OWNER) redirect("/dashboard");

  const [clients, editors, campaigns] = await Promise.all([
    prisma.client.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, brandName: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.user.findMany({
      where: { role: Role.EDITOR, status: "ACTIVE" },
      select: { id: true, displayName: true, email: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.campaign.findMany({
      include: {
        client: { select: { id: true, name: true, brandName: true } },
        defaultEditor: { select: { id: true, displayName: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    }),
  ]);

  return (
    <CampaignsManager
      initialCampaigns={campaigns.map((campaign) => ({
        ...campaign,
        pricePerVideo: Number(campaign.pricePerVideo),
      }))}
      clients={clients}
      editors={editors}
    />
  );
}
