import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadataJson?: Prisma.InputJsonValue;
};

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      metadataJson: input.metadataJson,
    },
  });
}
