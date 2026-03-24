import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

const REQUEST_ID_HEADER = "x-request-id";

export function resolveRequestId(request: NextRequest): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? randomUUID();
}

export function requestIdHeader(): string {
  return REQUEST_ID_HEADER;
}
