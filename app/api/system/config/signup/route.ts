import { Role, SystemAssignmentMode } from "@prisma/client";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { forbidden } from "@/lib/http/errors";
import { ok } from "@/lib/http/response";
import { defineRoute, parseJson } from "@/lib/http/route";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

const signupToggleSchema = z.object({
  editorSignupOpen: z.boolean(),
});

async function getConfig() {
  return prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      assignmentMode: SystemAssignmentMode.AUTOMATIC,
      darkModeEnabled: true,
      editorSignupOpen: true,
    },
  });
}

export const GET = defineRoute(async (_request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
    forbidden("Solo owner/admin pueden ver esta configuracion");
  }

  const config = await getConfig();
  return ok({ editorSignupOpen: config.editorSignupOpen }, requestId);
});

export const PATCH = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  if (actor.role !== Role.OWNER) {
    forbidden("Solo owner puede cambiar este ajuste");
  }

  const payload = signupToggleSchema.parse(await parseJson(request));
  const config = await getConfig();

  if (config.editorSignupOpen === payload.editorSignupOpen) {
    return ok({ editorSignupOpen: config.editorSignupOpen }, requestId);
  }

  const updated = await prisma.systemConfig.update({
    where: { id: "default" },
    data: { editorSignupOpen: payload.editorSignupOpen },
    select: { editorSignupOpen: true },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "system.editor_signup_toggle_changed",
    entityType: "SystemConfig",
    entityId: "default",
    metadataJson: {
      from: config.editorSignupOpen,
      to: updated.editorSignupOpen,
    },
    ip,
    userAgent,
  });

  return ok(updated, requestId);
});
