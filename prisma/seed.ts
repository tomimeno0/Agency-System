import "dotenv/config";
import { LearningLevel, Role, SystemAssignmentMode, UserStatus } from "@prisma/client";
import { hashPassword } from "../lib/security/password";
import { prisma } from "../lib/db";

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "editexstudioo@gmail.com";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "Editex132.";
  const passwordHash = await hashPassword(ownerPassword);

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: ownerEmail,
      passwordHash,
      displayName: "Owner",
      fullName: "Agency Owner",
      role: Role.OWNER,
      status: UserStatus.ACTIVE,
      timezone: "UTC",
    },
  });

  const learningSeed = [    
    {
      title: "Narrative Editing Fundamentals",
      description: "Core pacing, story structure, and sequencing principles.",
      url: "https://example.com/learning/narrative-fundamentals",
      level: LearningLevel.BEGINNER,
      tags: ["story", "pacing"],
    },
    {
      title: "Short-Form Retention Patterns",
      description: "Hooks, rhythm, and beat structure for short videos.",
      url: "https://example.com/learning/short-form-retention",
      level: LearningLevel.INTERMEDIATE,
      tags: ["shorts", "retention"],
    },
    {
      title: "Advanced Audio-Visual Flow",
      description: "Transitions, audio layering, and final polish workflows.",
      url: "https://example.com/learning/av-flow",
      level: LearningLevel.ADVANCED,
      tags: ["audio", "finishing"],
    },
  ];

  for (const resource of learningSeed) {
    await prisma.learningResource.upsert({
      where: { url: resource.url },
      update: {
        title: resource.title,
        description: resource.description,
        level: resource.level,
        tags: resource.tags,
        isActive: true,
      },
      create: resource,
    });
  }

  await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {
      assignmentMode: SystemAssignmentMode.AUTOMATIC,
      darkModeEnabled: true,
    },
    create: {
      id: "default",
      assignmentMode: SystemAssignmentMode.AUTOMATIC,
      darkModeEnabled: true,
    },
  });

  console.log(`Seed completed. Owner id: ${owner.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
