export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): never {
  throw new ApiError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Unauthorized"): never {
  throw new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden"): never {
  throw new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "Not found"): never {
  throw new ApiError(404, "NOT_FOUND", message);
}

export function conflict(message: string, details?: unknown): never {
  throw new ApiError(409, "CONFLICT", message, details);
}

export function unprocessable(message: string, details?: unknown): never {
  throw new ApiError(422, "UNPROCESSABLE_ENTITY", message, details);
}

export function tooManyRequests(message = "Too many requests"): never {
  throw new ApiError(429, "TOO_MANY_REQUESTS", message);
}
