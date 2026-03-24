import { cookies } from "next/headers";
import { env } from "@/lib/env";

type ApiEnvelope<T> = {
  ok: boolean;
  data: {
    items?: T[];
  };
};

export async function fetchApiItems<T>(path: string): Promise<T[]> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${env.NEXTAUTH_URL}${path}`, {
    method: "GET",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data.items ?? [];
}
