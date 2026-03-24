import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/http/errors";
import { fail } from "@/lib/http/response";
import { logger } from "@/lib/logger";
import { resolveRequestId } from "@/lib/request-id";

export type AppRouteHandler<T = NextResponse> = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
  requestId: string,
) => Promise<T>;

function mapPrismaCode(error: Prisma.PrismaClientKnownRequestError): [number, string, string] {
  switch (error.code) {
    case "P2002":
      return [409, "CONFLICT", "Unique constraint violation"];
    case "P2025":
      return [404, "NOT_FOUND", "Record not found"];
    default:
      return [500, "INTERNAL_SERVER_ERROR", "Database error"];
  }
}

export function withErrorHandling(handler: AppRouteHandler): AppRouteHandler {
  return async (request, context, requestId) => {
    try {
      return await handler(request, context, requestId);
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.status, error.code, error.message, requestId, error.details);
      }

      if (error instanceof ZodError) {
        return fail(422, "VALIDATION_ERROR", "Validation failed", requestId, error.issues);
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const [status, code, message] = mapPrismaCode(error);
        return fail(status, code, message, requestId, { prismaCode: error.code });
      }

      logger.error({ err: error, requestId }, "Unhandled route error");
      return fail(500, "INTERNAL_SERVER_ERROR", "Unexpected server error", requestId);
    }
  };
}

export function defineRoute(handler: AppRouteHandler): (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  const wrapped = withErrorHandling(handler);
  return async (request, context) => {
    const requestId = resolveRequestId(request);
    return wrapped(request, context, requestId);
  };
}

export async function parseJson<T>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}
