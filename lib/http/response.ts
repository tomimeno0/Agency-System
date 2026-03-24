import { NextResponse } from "next/server";
import { requestIdHeader } from "@/lib/request-id";

export function ok<T>(data: T, requestId: string, status = 200): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      data,
      requestId,
      timestamp: new Date().toISOString(),
    },
    {
      status,
      headers: {
        [requestIdHeader()]: requestId,
      },
    },
  );
}

export function fail(
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        details,
      },
      requestId,
      timestamp: new Date().toISOString(),
    },
    {
      status,
      headers: {
        [requestIdHeader()]: requestId,
      },
    },
  );
}
