import { NotificationType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendSecurityAlertEmail, smtpConfigured } from "@/lib/services/email";
import { createNotification } from "@/lib/services/notifications";

export async function dispatchSecurityAlert(input: {
  title: string;
  message: string;
  metadataJson?: Prisma.InputJsonValue;
}) {
  const owners = await prisma.user.findMany({
    where: { role: Role.OWNER, status: "ACTIVE" },
    select: { id: true, email: true },
    take: 10,
  });

  for (const owner of owners) {
    await createNotification({
      userId: owner.id,
      type: NotificationType.SYSTEM,
      title: `Seguridad: ${input.title}`,
      message: input.message,
      metadataJson: input.metadataJson ?? {},
    });
  }

  if (!smtpConfigured()) return;
  const emailTargets = new Set<string>();
  if (env.SECURITY_ALERT_OWNER_EMAIL) {
    emailTargets.add(env.SECURITY_ALERT_OWNER_EMAIL);
  }
  for (const owner of owners) {
    if (owner.email) emailTargets.add(owner.email);
  }

  for (const email of emailTargets) {
    await sendSecurityAlertEmail({
      to: email,
      title: input.title,
      message: input.message,
    });
  }
}
