import { NextRequest } from "next/server";

export function getPagination(request: NextRequest): { take: number; skip: number } {
  const take = Number(request.nextUrl.searchParams.get("take") ?? 25);
  const skip = Number(request.nextUrl.searchParams.get("skip") ?? 0);

  return {
    take: Number.isFinite(take) ? Math.min(Math.max(take, 1), 100) : 25,
    skip: Number.isFinite(skip) ? Math.max(skip, 0) : 0,
  };
}
