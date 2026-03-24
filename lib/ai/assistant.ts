type AssistantInput = {
  message: string;
  context?: {
    niche?: string;
    platform?: string;
    tone?: string;
  };
};

export function generateAssistantReply(input: AssistantInput): string {
  const platform = input.context?.platform ?? "short-form";
  const niche = input.context?.niche ?? "general";
  const tone = input.context?.tone ?? "direct";

  return [
    `Plan for ${platform} (${niche}, tone: ${tone}):`,
    "1) Hook in first 2 seconds with a concrete promise.",
    "2) Keep 1 idea per block and cut filler transitions.",
    "3) Use rhythm changes every 3-6 seconds (cut, zoom, B-roll, caption emphasis).",
    "4) End with a clear payoff + CTA aligned with the narrative.",
    `Question detected: ${input.message}`,
  ].join("\n");
}
