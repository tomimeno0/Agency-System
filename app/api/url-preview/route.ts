import { defineRoute } from "@/lib/http/route";
import { ok } from "@/lib/http/response";
import { badRequest } from "@/lib/http/errors";

const IMAGE_META_PATTERNS = [
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']og:image["'][^>]*>/i,
  /<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']twitter:image["'][^>]*>/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
];

function extractImageUrlFromHtml(html: string): string | null {
  for (const pattern of IMAGE_META_PATTERNS) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function buildUniversalPreviewUrl(url: string): string {
  // Screenshot fallback provider for any URL (html, video page, pdf, etc.)
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1280`;
}

export const GET = defineRoute(async (request, _context, requestId) => {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    badRequest("url is required");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    badRequest("Invalid url");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    badRequest("Only http/https urls are supported");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(parsedUrl.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "EditexStudioPreviewBot/1.0 (+learning-preview)",
        Accept: "text/html, image/*;q=0.9, */*;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return ok({ imageUrl: buildUniversalPreviewUrl(parsedUrl.toString()) }, requestId);
    }

    const finalUrl = response.url || parsedUrl.toString();
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (contentType.startsWith("image/")) {
      return ok({ imageUrl: finalUrl }, requestId);
    }

    if (!contentType.includes("text/html")) {
      return ok({ imageUrl: buildUniversalPreviewUrl(finalUrl) }, requestId);
    }

    const html = await response.text();
    const extracted = extractImageUrlFromHtml(html);
    if (!extracted) {
      return ok({ imageUrl: buildUniversalPreviewUrl(finalUrl) }, requestId);
    }

    let resolvedImageUrl = extracted;
    try {
      resolvedImageUrl = new URL(extracted, finalUrl).toString();
    } catch {
      resolvedImageUrl = extracted;
    }

    return ok({ imageUrl: resolvedImageUrl }, requestId);
  } catch {
    return ok({ imageUrl: buildUniversalPreviewUrl(parsedUrl.toString()) }, requestId);
  } finally {
    clearTimeout(timeout);
  }
});
