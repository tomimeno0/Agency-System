import { Prisma, Role } from "@prisma/client";
import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { prisma } from "@/lib/db";
import { requireRole, requireSessionUser } from "@/lib/auth/session";
import { clientCreateSchema } from "@/lib/validation/schemas";
import { decryptField, encryptField } from "@/lib/security/encryption";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";
import { getPagination } from "@/lib/http/query";

function mapClient<T extends { phoneEncrypted: string | null; notesEncrypted: string | null; phoneKeyVersion: number | null; notesKeyVersion: number | null }>(client: T) {
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

export const GET = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const { take, skip } = getPagination(request);
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });

  return ok({ items: clients.map(mapClient), take, skip }, requestId);
});

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  requireRole(actor, [Role.OWNER, Role.ADMIN]);

  const payload = clientCreateSchema.parse(await parseJson(request));
  const encryptedPhone = payload.phone ? encryptField(payload.phone) : null;
  const encryptedNotes = payload.notes ? encryptField(payload.notes) : null;

  const client = await prisma.client.create({
    data: {
      name: payload.name,
      brandName: payload.brandName,
      email: payload.email?.toLowerCase(),
      phoneEncrypted: encryptedPhone?.ciphertext,
      phoneKeyVersion: encryptedPhone?.keyVersion,
      notesEncrypted: encryptedNotes?.ciphertext,
      notesKeyVersion: encryptedNotes?.keyVersion,
      stylePreferences: payload.stylePreferences as Prisma.InputJsonValue | undefined,
      references: payload.references as Prisma.InputJsonValue | undefined,
      packSize: payload.packSize,
      packPrice: payload.packPrice,
      createdById: actor.id,
    },
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "clients.create",
    entityType: "Client",
    entityId: client.id,
    metadataJson: { name: client.name },
    ip,
    userAgent,
  });

  return ok(mapClient(client), requestId, 201);
});
