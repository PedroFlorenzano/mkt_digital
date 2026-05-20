import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ExternalServiceError,
} from "@server/lib/errors";

describe("AppError", () => {
  it("creates error with correct properties", () => {
    const err = new AppError("TEST_CODE", "test message", 400, { field: "value" });
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: "value" });
    expect(err instanceof Error).toBe(true);
  });
});

describe("ValidationError", () => {
  it("has status 400", () => {
    const err = new ValidationError("invalid input");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
  });
});

describe("NotFoundError", () => {
  it("has status 404 and includes resource name", () => {
    const err = new NotFoundError("Post");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("Post");
  });
});

describe("UnauthorizedError", () => {
  it("has status 401", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });
});

describe("ForbiddenError", () => {
  it("has status 403", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });
});

describe("ExternalServiceError", () => {
  it("has status 502 and includes service name", () => {
    const err = new ExternalServiceError("AWS Bedrock", "timeout");
    expect(err.statusCode).toBe(502);
    expect(err.message).toContain("AWS Bedrock");
    expect(err.message).toContain("timeout");
  });
});
