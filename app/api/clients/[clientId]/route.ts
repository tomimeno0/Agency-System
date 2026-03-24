import { Prisma, Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { requireRole, requireSessionUser } from "@/lib/auth/session";
import { clientUpdateSchema } from "@/lib/validation/schemas";
import { decryptField, encryptField } from "@/lib/security/encryption";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

function mapClient(client: {
  phoneEncrypted: string | null;
  notesEncrypted: string | null;
  phoneKeyVersion: number | null;
  notesKeyVersion: number | null;
  [key: string]: unknown;
}) {
  return {
    ...client,
    phone: client.phoneEncrypted ? decryptField(client.phoneEncrypted) : null,
    notes: client.notesEncrypted ? decryptField(client.notesEncrypted) : null,
    phoneEncrypted: undefined,
    notesEncrypted: undefined,
    phoneKeyVersion: undefined,
    notesKeyVersion: undefined,
  };
}

export const GET = defineRoute(async (_request, context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const { clientId } = await context.params;
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });

  return ok(mapClient(client), requestId);
});

export const PATCH = defineRoute(async (request, context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const { clientId } = await context.params;
  const payload = clientUpdateSchema.parse(await parseJson(request));

  const encryptedPhone = payload.phone ? encryptField(payload.phone) : undefined;
  const encryptedNotes = payload.notes ? encryptField(payload.notes) : undefined;

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      name: payload.name,
      brandName: payload.brandName,
      email: payload.email?.toLowerCase(),
      status: payload.status,
      phoneEncrypted: encryptedPhone?.ciphertext,
      phoneKeyVersion: encryptedPhone?.keyVersion,
      notesEncrypted: encryptedNotes?.ciphertext,
      notesKeyVersion: encryptedNotes?.keyVersion,
      stylePreferences: payload.stylePreferences as Prisma.InputJsonValue | undefined,
      references: payload.references as Prisma.InputJsonValue | undefined,
      packSize: payload.packSize,
      packPrice: payload.packPrice,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "clients.update",
    entityType: "Client",
    entityId: clientId,
    metadataJson: { fields: Object.keys(payload) },
    ip,
    userAgent,
  });

  return ok(mapClient(client), requestId);
});
