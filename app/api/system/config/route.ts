import { Role, SystemAssignmentMode } from "@prisma/client";
import { z } from "zod";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { requireRole, requireSessionUser } from "@/lib/auth/session";
import { getSystemConfig } from "@/lib/services/assignment-engine";
import { prisma } from "@/lib/db";

const updateSchema = z.object({
  assignmentMode: z.nativeEnum(SystemAssignmentMode).optional(),
  darkModeEnabled: z.boolean().optional(),
});

export const GET = defineRoute(async (_request, _context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const config = await getSystemConfig();
  return ok(config, requestId);
});

export const PATCH = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER]);

  const payload = updateSchema.parse(await parseJson(request));
  const config = await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {
      assignmentMode: payload.assignmentMode,
      darkModeEnabled: payload.darkModeEnabled,
    },
    create: {
      id: "default",
      assignmentMode: payload.assignmentMode ?? SystemAssignmentMode.AUTOMATIC,
      darkModeEnabled: payload.darkModeEnabled ?? true,
      editorSignupOpen: true,
    },
  });

  return ok(config, requestId);
});
