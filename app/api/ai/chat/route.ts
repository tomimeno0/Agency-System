import { defineRoute, parseJson } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { conflict } from "@/lib/http/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { aiChatSchema } from "@/lib/validation/schemas";
import { generateAssistantReply } from "@/lib/ai/assistant";
import { env } from "@/lib/env";
import { appendAuditLog, requestMeta } from "@/lib/services/audit";

export const POST = defineRoute(async (request, _context, requestId) => {
  const actor = await requireSessionUser();
  const payload = aiChatSchema.parse(await parseJson(request));

  if (!env.AI_ASSISTANT_ENABLED) {
    conflict("AI assistant is disabled");
  }

  const response = generateAssistantReply({
    message: payload.message,
    context: payload.context,
  });

  const { ip, userAgent } = requestMeta(request);
  await appendAuditLog({
    actorUserId: actor.id,
    action: "ai.chat_prompt",
    entityType: "AI",
    entityId: actor.id,
    metadataJson: {
      messageLength: payload.message.length,
    },
    ip,
    userAgent,
  });

  return ok(
    {
      response,
      safety: "No operational secrets were accessed.",
    },
    requestId,
  );
});
