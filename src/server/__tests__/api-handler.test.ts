/**
 * Tests for withErrorHandler — the wrapper used by ~25 API routes.
 * Validates consistent error serialisation and HTTP status mapping.
 */

import { NextResponse } from "next/server";
import { withErrorHandler } from "../lib/api-handler";
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ExternalServiceError,
} from "../lib/errors";

// Minimal NextResponse stub so we don't need the full Next.js runtime
jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}));

const json = NextResponse.json as jest.MockedFunction<typeof NextResponse.json>;

afterEach(() => jest.clearAllMocks());

function makeRequest(url = "http://localhost/api/test"): Request {
  return { url, method: "GET" } as unknown as Request;
}

describe("withErrorHandler — happy path", () => {
  it("returns the handler result unchanged", async () => {
    const handler = withErrorHandler(async () =>
      NextResponse.json({ ok: true })
    );
    const result = await handler(makeRequest());
    expect(json).toHaveBeenCalledWith({ ok: true });
    expect(result).toEqual(expect.objectContaining({ body: { ok: true } }));
  });
});

describe("withErrorHandler — AppError subclasses", () => {
  const cases = [
    { error: new ValidationError("bad input"),           expectedStatus: 400 },
    { error: new NotFoundError("User"),                  expectedStatus: 404 },
    { error: new UnauthorizedError(),                    expectedStatus: 401 },
    { error: new ForbiddenError(),                       expectedStatus: 403 },
    { error: new ConflictError("already exists"),        expectedStatus: 409 },
    { error: new ExternalServiceError("S3", "timeout"),  expectedStatus: 502 },
  ];

  it.each(cases)(
    "maps $error.name to HTTP $expectedStatus",
    async ({ error, expectedStatus }) => {
      const handler = withErrorHandler(async () => { throw error; });
      await handler(makeRequest());
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error: error.message }),
        { status: expectedStatus },
      );
    },
  );
});

describe("withErrorHandler — unknown errors", () => {
  it("returns 500 for a plain Error", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("unexpected crash");
    });
    await handler(makeRequest());
    expect(json).toHaveBeenCalledWith(
      { error: "Internal server error" },
      { status: 500 },
    );
  });

  it("returns 500 for a thrown string", async () => {
    const handler = withErrorHandler(async () => { throw "oops"; });
    await handler(makeRequest());
    expect(json).toHaveBeenCalledWith(
      { error: "Internal server error" },
      { status: 500 },
    );
  });
});
