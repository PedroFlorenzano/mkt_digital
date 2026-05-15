import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { logger } from "./logger";

type ApiHandler = (request: Request) => Promise<NextResponse>;

/**
 * Wraps an API route handler with:
 * - Consistent error handling
 * - Structured logging
 * - AppError → proper HTTP status mapping
 */
export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (request: Request): Promise<NextResponse> => {
    try {
      return await handler(request);
    } catch (err) {
      if (err instanceof AppError) {
        logger.warn(`[api] AppError: ${err.message}`, {
          code: err.code,
          statusCode: err.statusCode,
          path: new URL(request.url).pathname,
        });
        return NextResponse.json(
          { error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) },
          { status: err.statusCode },
        );
      }

      logger.error("[api] Unhandled error", err, {
        path: new URL(request.url).pathname,
        method: request.method,
      });

      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
