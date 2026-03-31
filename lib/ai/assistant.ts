type AssistantInput = {
  message: string;
  context?: {
    niche?: string;
    platform?: string;
    tone?: string;
  };
};

function normalize(text: string): string {
  return text.toLowerCase();
}

function buildChecklist(platform: string, niche: string): string[] {
  return [
    `Checklist pre-entrega (${platform}/${niche}):`,
    "1. Hook visible en los primeros 2 segundos.",
    "2. Audio limpio y consistente (sin picos ni cortes).",
    "3. Subtitulos sincronizados y legibles en mobile.",
    "4. Ritmo de cortes cada 3-6 segundos.",
    "5. CTA final clara y coherente con el objetivo del video.",
  ];
}

function buildQaReview(): string[] {
  return [
    "QA pre-envio:",
    "1. Revisar ortografia en subtitulos y overlays.",
    "2. Confirmar que no falten tomas clave del guion.",
    "3. Verificar niveles de voz/musica (voz por encima).",
    "4. Chequear que export coincide con formato solicitado.",
    "5. Ver version completa una vez sin pausas antes de entregar.",
  ];
}

function buildFeedbackSummary(message: string): string[] {
  return [
    "Resumen de feedback sugerido:",
    `- Punto principal: ${message}`,
    "- Accion 1: ajustar hook y arranque para retencion.",
    "- Accion 2: simplificar bloques y eliminar relleno.",
    "- Accion 3: reforzar cierre con CTA directa.",
  ];
}

function buildTimeEstimate(): string[] {
  return [
    "Sugerencia de tiempos:",
    "- Corte base y orden: 20-30 min",
    "- Ajustes de ritmo y B-roll: 25-40 min",
    "- Subtitulos y limpieza final: 20-30 min",
    "- QA final y export: 10-15 min",
    "- Total estimado: 75-115 min por pieza corta",
  ];
}

export function generateAssistantReply(input: AssistantInput): string {
  const platform = input.context?.platform ?? "short-form";
  const niche = input.context?.niche ?? "general";
  const tone = input.context?.tone ?? "direct";
  const message = normalize(input.message);

  if (message.includes("checklist") || message.includes("pre entrega") || message.includes("pre-entrega")) {
    return buildChecklist(platform, niche).join("\n");
  }

  if (message.includes("qa") || message.includes("revision") || message.includes("revisi")) {
    return buildQaReview().join("\n");
  }

  if (message.includes("feedback") || message.includes("resumen")) {
    return buildFeedbackSummary(input.message).join("\n");
  }

  if (message.includes("tiempo") || message.includes("estimacion") || message.includes("estimar")) {
    return buildTimeEstimate().join("\n");
  }

  return [
    `Plan sugerido para ${platform} (${niche}, tono: ${tone}):`,
    "1) Hook en los primeros 2 segundos con promesa concreta.",
    "2) Una idea por bloque y sin transiciones de relleno.",
    "3) Cambios de ritmo cada 3-6 segundos (corte, zoom, B-roll, subtitulo).",
    "4) Cierre con payoff claro y CTA alineada al objetivo.",
    `Consulta detectada: ${input.message}`,
  ].join("\n");
}
