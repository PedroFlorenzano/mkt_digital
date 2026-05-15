# Requirements Document

## Introduction

This document defines the requirements for professionalizing the MKT Digital Platform — a Next.js 16 SaaS application that provides AI-powered marketing content generation (text and images via AWS Bedrock), social media scheduling, and company brand management.

The platform currently works but lacks the structural rigor needed for a production SaaS product. This professionalization effort covers five interconnected areas: software architecture, automated testing, security hardening (with PCI-DSS readiness for future recurring payments), image generation quality, and observability/performance. The goal is to transform the codebase from a functional prototype into a maintainable, secure, and scalable product.

---

## Glossary

- **Platform**: The MKT Digital Platform Next.js 16 application.
- **API_Route**: A Next.js Route Handler under `src/app/api/`.
- **Service_Layer**: A set of TypeScript modules under `src/lib/services/` that encapsulate business logic, isolated from HTTP concerns.
- **Repository**: A TypeScript module under `src/lib/repositories/` that encapsulates all Prisma database access for a given domain entity.
- **Validator**: A Zod schema or validation function responsible for parsing and validating incoming request data.
- **Image_Composer**: The module responsible for composing marketing post images, currently `src/lib/image-compose.ts`.
- **Prompt_Translator**: A Claude-powered service that converts a user's Portuguese-language idea into a precise English technical prompt suitable for Stable Diffusion image generation.
- **Bedrock_Client**: The AWS Bedrock SDK wrapper in `src/lib/bedrock.ts` that calls Claude (text) and Stable Diffusion Ultra (image) models.
- **Auth_Guard**: The session-validation logic that verifies a valid NextAuth session before processing any API request.
- **Rate_Limiter**: A middleware component that tracks and limits the number of requests per user/IP within a time window.
- **Cost_Logger**: The service responsible for recording AI usage costs to the `CostLog` table.
- **Secrets_Manager**: The mechanism for loading sensitive configuration values (API keys, database URLs, AWS credentials) exclusively from environment variables, never from source code.
- **Structured_Logger**: A logging utility that emits JSON-formatted log entries with consistent fields (timestamp, level, requestId, userId, error).
- **Test_Suite**: The collection of Jest unit and integration tests under `src/__tests__/`.
- **PCI_DSS**: Payment Card Industry Data Security Standard — the compliance framework required for handling credit card data.
- **Subscription**: A recurring billing relationship between a user and the Platform, to be implemented in a future payment phase.
- **Migration**: A Prisma migration script that evolves the database schema from SQLite to PostgreSQL.

---

## Requirements

### Requirement 1: Service Layer and Separation of Concerns

**User Story:** As a developer, I want business logic isolated in a dedicated service layer, so that API routes remain thin HTTP adapters and logic can be tested independently.

#### Acceptance Criteria

1. THE Platform SHALL provide a `src/lib/services/` directory containing one service module per domain: `PostService`, `CompanyService`, `ImageGenerationService`, `TextGenerationService`, and `CostService`.
2. THE Platform SHALL provide a `src/lib/repositories/` directory containing one repository module per Prisma model: `PostRepository`, `CompanyRepository`, and `CostRepository`.
3. WHEN an API_Route handles a request, THE API_Route SHALL delegate all database access to a Repository and all business logic to a Service, containing no direct `prisma.*` calls itself.
4. THE Service_Layer SHALL receive Repository instances through constructor parameters or function parameters, so that tests can substitute mock repositories without modifying service code; direct instantiation of repositories inside service functions is not permitted.
5. THE Platform SHALL enforce that no component outside `src/lib/repositories/` imports `@prisma/client` directly, verified by an ESLint rule or TypeScript path alias restriction.

---

### Requirement 2: Input Validation with Zod

**User Story:** As a developer, I want all API inputs validated with Zod schemas before reaching business logic, so that malformed or malicious data is rejected at the boundary.

#### Acceptance Criteria

1. THE Platform SHALL define a Zod schema for every API_Route request body, located in `src/lib/validators/`.
2. WHEN a request body fails Zod validation, THE Validator SHALL return HTTP 422 with a structured JSON error listing each invalid field and its message.
3. THE Platform SHALL enforce string length limits on all free-text fields: `idea` and `topic` fields SHALL be limited to 2000 characters, `name` fields to 200 characters, and `description` fields to 5000 characters.
4. THE Platform SHALL enforce that `platform` fields only accept values from the enumerated set `["instagram", "facebook", "linkedin", "whatsapp"]`.
5. WHEN a request body contains unexpected additional fields, THE Validator SHALL strip those fields before passing data to the Service_Layer (Zod `.strip()` behavior).

---

### Requirement 3: Rate Limiting

**User Story:** As a platform operator, I want API endpoints protected by rate limiting, so that individual users cannot exhaust AI generation quotas or destabilize the service.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL limit each authenticated user to 20 image generation requests per hour on the `/api/generate/image` endpoint.
2. THE Rate_Limiter SHALL limit each authenticated user to 60 text generation requests per hour on the `/api/generate/text` endpoint.
3. THE Rate_Limiter SHALL limit unauthenticated requests to 10 requests per minute per IP address on all `/api/auth/` endpoints, to prevent credential-stuffing attacks.
4. WHEN a rate limit is exceeded, THE Rate_Limiter SHALL return HTTP 429 with a `Retry-After` header indicating the number of seconds until the limit resets.
5. THE Rate_Limiter SHALL store counters in a persistent store (Redis or equivalent) so that limits survive server restarts and work correctly across multiple instances.

---

### Requirement 4: CSRF Protection

**User Story:** As a security engineer, I want state-mutating API routes protected against Cross-Site Request Forgery, so that authenticated users cannot be tricked into performing unintended actions.

#### Acceptance Criteria

1. THE Platform SHALL validate the `Origin` or `Referer` header on all `POST`, `PUT`, `PATCH`, and `DELETE` API_Route handlers, rejecting requests whose origin does not match the application's configured `NEXT_PUBLIC_APP_URL`.
2. WHERE the Platform uses NextAuth session cookies, THE Platform SHALL configure NextAuth with `useSecureCookies: true` and `sameSite: "lax"` in production environments.
3. WHEN a request fails CSRF validation, THE API_Route SHALL return HTTP 403 with the message `"Forbidden: invalid origin"`; IF the system encounters an error while attempting to send the 403 response, THEN THE API_Route SHALL fall back to any available error status code to ensure the request is not processed.

---

### Requirement 5: Secrets Management

**User Story:** As a security engineer, I want all sensitive credentials loaded exclusively from environment variables, so that secrets are never committed to source control.

#### Acceptance Criteria

1. THE Secrets_Manager SHALL load all sensitive values — including `DATABASE_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, AWS credentials, and future payment provider keys — exclusively from `process.env`.
2. THE Platform SHALL provide a `.env.example` file listing every required environment variable with placeholder values and inline comments describing each variable's purpose.
3. IF a required environment variable is absent at application startup, THEN THE Platform SHALL throw a descriptive error identifying the missing variable name and halt startup.
4. THE Platform SHALL never log the values of secret environment variables; THE Structured_Logger SHALL redact any field whose key contains the substrings `secret`, `password`, `token`, or `key` (case-insensitive), replacing the value with `"[REDACTED]"`.
5. THE Platform SHALL store AWS credentials exclusively via IAM roles (in production) or named AWS profiles (in development), and SHALL NOT accept `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as environment variables in production deployments.

---

### Requirement 6: SQL Injection Prevention

**User Story:** As a security engineer, I want all database interactions to use parameterized queries, so that SQL injection attacks are structurally impossible.

#### Acceptance Criteria

1. THE Repository SHALL perform all database operations exclusively through Prisma Client's typed query API, never using `prisma.$queryRaw` or `prisma.$executeRaw` with string interpolation.
2. WHERE raw SQL is genuinely required, THE Repository SHALL use Prisma's `sql` tagged template literal (`Prisma.sql`) with bound parameters exclusively; string concatenation in raw SQL expressions is prohibited even when tagged template literals are also present.
3. THE Platform SHALL include an ESLint rule or custom lint check that flags any use of `$queryRaw` or `$executeRaw` with a template literal containing a variable.

---

### Requirement 7: PCI-DSS Readiness for Payment Processing

**User Story:** As a platform operator, I want the architecture prepared for PCI-DSS compliant recurring payment processing, so that credit card data is never stored on our servers and future Stripe/payment integration is straightforward.

#### Acceptance Criteria

1. THE Platform SHALL add a `Subscription` model to the Prisma schema with fields: `id`, `userId`, `planId`, `status` (enum: `active`, `canceled`, `past_due`, `trialing`), `currentPeriodStart`, `currentPeriodEnd`, `paymentProvider` (e.g., `"stripe"`), `providerSubscriptionId`, `createdAt`, `updatedAt`.
2. THE Platform SHALL add a `Plan` model to the Prisma schema with fields: `id`, `name`, `priceMonthlyUsd`, `priceYearlyUsd`, `aiImageCreditsPerMonth`, `aiTextCreditsPerMonth`, `createdAt`.
3. THE Platform SHALL never store raw credit card numbers, CVV codes, or full PANs in any database table, log file, or environment variable.
4. WHEN a payment webhook is received from a payment provider with an invalid or missing signature, THE Platform SHALL completely reject the webhook without any processing and return HTTP 400.
5. WHEN a payment webhook is received from a payment provider with a valid signature, THE Platform SHALL verify the webhook signature using the provider's signing secret before processing the event.
6. THE Platform SHALL enforce HTTPS for all endpoints in production, rejecting HTTP requests with a redirect to HTTPS.
7. THE Platform SHALL log all payment-related events (subscription created, payment succeeded, payment failed, subscription canceled) to a dedicated audit log with immutable append-only semantics.

---

### Requirement 8: Database Migration to PostgreSQL

**User Story:** As a developer, I want the database migrated from SQLite to PostgreSQL, so that the platform can support concurrent users, full-text search, and production-grade reliability.

#### Acceptance Criteria

1. THE Platform SHALL update `prisma/schema.prisma` to use `provider = "postgresql"` with `DATABASE_URL` sourced from environment variables.
2. THE Platform SHALL provide a Prisma migration file that creates all current tables in PostgreSQL with appropriate indexes on foreign keys and frequently queried fields (`Post.companyId`, `Post.status`, `Post.scheduledAt`, `CostLog.companyId`, `CostLog.createdAt`); migration files MAY be created while the development environment still uses SQLite, and SHALL be applied once PostgreSQL is configured.
3. THE Platform SHALL add a `@db.Text` annotation to all `String` fields that may exceed 255 characters (e.g., `Post.content`, `Company.description`, `CostLog.metadata`).
4. WHEN the application starts in production, THE Platform SHALL first verify the database connection and, only after a successful connection, run pending migrations automatically, logging the result; IF the connection verification fails, THEN THE Platform SHALL halt startup without attempting migrations.

---

### Requirement 9: TypeScript Strict Mode

**User Story:** As a developer, I want TypeScript strict mode enabled across the entire codebase, so that type errors are caught at compile time rather than at runtime.

#### Acceptance Criteria

1. THE Platform SHALL enable `"strict": true` in `tsconfig.json`, which activates `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, and related checks.
2. THE Platform SHALL enable `"noUncheckedIndexedAccess": true` in `tsconfig.json` to prevent unsafe array and object index access.
3. WHEN `npm run build` is executed, THE Platform SHALL produce zero TypeScript compiler errors; TypeScript errors that exist between builds are permitted as long as the build itself passes.
4. THE Platform SHALL eliminate all uses of the `any` type in `src/`, replacing them with precise types or `unknown` with explicit narrowing.
5. THE Platform SHALL define explicit return types on all exported functions and all API_Route handlers.

---

### Requirement 10: ESLint Strict Rules

**User Story:** As a developer, I want a strict ESLint configuration enforced in CI, so that code quality issues are caught before they reach the main branch.

#### Acceptance Criteria

1. THE Platform SHALL configure ESLint with rules that flag: `no-console` (warn), `no-explicit-any` (error), `no-unused-vars` (error), `@typescript-eslint/no-floating-promises` (error), and `@typescript-eslint/consistent-type-imports` (error).
2. THE Platform SHALL add a `lint` script to `package.json` that runs ESLint with `--max-warnings 0`, causing CI to fail on any warning.
3. WHEN `npm run lint` is executed on the codebase, THE Platform SHALL produce zero errors and zero warnings on new code; existing violations in code predating this requirement MAY be fixed incrementally and SHALL NOT block merging of new compliant code.
4. THE Platform SHALL configure ESLint to enforce that all `async` functions either `await` their result or explicitly handle the returned Promise, preventing unhandled promise rejections.

---

### Requirement 11: Consistent Error Handling

**User Story:** As a developer, I want a standardized error handling pattern across all API routes, so that errors are logged consistently and clients always receive structured error responses.

#### Acceptance Criteria

1. THE Platform SHALL provide a typed `AppError` class with fields `code` (string), `message` (string), `statusCode` (number), and optional `details` (unknown).
2. THE Platform SHALL provide a `withErrorHandler` higher-order function that wraps API_Route handlers, catches all thrown errors, logs them via the Structured_Logger, and returns a consistent JSON error response.
3. WHEN an `AppError` is thrown inside a wrapped handler, THE Platform SHALL return the `AppError.statusCode` and `AppError.message` to the client.
4. WHEN an unexpected `Error` is thrown inside a wrapped handler, THE Platform SHALL return HTTP 500 with the message `"Internal server error"` to the client, without leaking stack traces or internal details.
5. THE Platform SHALL never return raw Prisma error objects or AWS SDK error objects directly to API clients.

---

### Requirement 12: Structured Logging and Observability

**User Story:** As a platform operator, I want structured JSON logs with consistent fields, so that I can query and alert on errors in production log aggregation tools.

#### Acceptance Criteria

1. THE Structured_Logger SHALL emit JSON log entries with the following fields on every log call: `timestamp` (ISO 8601), `level` (`debug` | `info` | `warn` | `error`), `message` (string), and `requestId` (string, when available).
2. WHEN an error is logged, THE Structured_Logger SHALL include an `error` field containing `{ name, message, stack }` from the Error object.
3. THE Platform SHALL assign a unique `requestId` (UUID v4) to each incoming API request and propagate it through all log entries generated during that request's lifecycle.
4. THE Platform SHALL log the following events at `info` level: API request received (method, path, userId), AI generation completed (model, tokens/images, costUsd), post created, post scheduled.
5. THE Platform SHALL log the following events at `error` level: Bedrock API failure, database query failure, authentication failure, rate limit exceeded.
6. THE Structured_Logger SHALL replace all existing `console.log`, `console.warn`, and `console.error` calls in `src/`.

---

### Requirement 13: Unit Tests for Services

**User Story:** As a developer, I want unit tests for all service modules, so that business logic regressions are caught automatically on every commit.

#### Acceptance Criteria

1. THE Test_Suite SHALL include Jest unit tests for `PostService`, `CompanyService`, `ImageGenerationService`, `TextGenerationService`, and `CostService`.
2. THE Test_Suite SHALL mock all Repository dependencies using Jest mock functions, so that unit tests do not require a database connection.
3. THE Test_Suite SHALL mock all Bedrock_Client calls using Jest mock functions, so that unit tests do not make real AWS API calls.
4. THE Test_Suite SHALL achieve a minimum of 80% line coverage on all files under `src/lib/services/`.
5. WHEN `npm test` is executed, THE Test_Suite SHALL run all unit tests and report coverage, completing within 60 seconds on a standard developer machine.
6. FOR ALL valid `PostService.createPost` inputs with any combination of `platform`, `content`, and `imageUrl`, THE Test_Suite SHALL verify that the returned post object contains the same `platform`, `content`, and `imageUrl` values that were provided as input (round-trip property).

---

### Requirement 14: Integration Tests for API Routes

**User Story:** As a developer, I want integration tests for critical API routes, so that the full request-response cycle is verified including authentication, validation, and database interaction.

#### Acceptance Criteria

1. THE Test_Suite SHALL include integration tests for the following API routes: `POST /api/generate/image`, `POST /api/generate/text`, `POST /api/posts`, `GET /api/posts`, `POST /api/company`, `GET /api/company`.
2. THE Test_Suite SHALL use an in-memory SQLite database (or a test PostgreSQL instance) for integration tests, isolated per test file; isolation between individual test cases within the same file is not required.
3. WHEN an unauthenticated request is sent to any protected API route, THE integration test SHALL verify that the response status is 401.
4. WHEN a request with an invalid body is sent to any API route with a Zod validator, THE integration test SHALL verify that the response status is 422 and the body contains field-level error details.
5. THE Test_Suite SHALL mock AWS Bedrock calls in integration tests using Jest module mocks, preventing real API calls during CI.

---

### Requirement 15: Image Generation — Claude-Assisted Prompt Translation

**User Story:** As a user, I want my Portuguese-language marketing idea translated into a precise English image generation prompt, so that the generated images are relevant to my company and campaign.

#### Acceptance Criteria

1. THE Prompt_Translator SHALL accept the user's raw idea text (in any language), the company name, sector, description, objective, tone, and brand colors as inputs.
2. WHEN the Prompt_Translator is invoked, THE Prompt_Translator SHALL call Claude via the Bedrock_Client with a system prompt instructing it to produce a single, precise English-language Stable Diffusion prompt that: (a) reflects the user's marketing idea, (b) incorporates the company's sector and visual identity, (c) specifies photographic style, lighting, and composition, and (d) explicitly prohibits text, letters, watermarks, and logos in the generated image.
3. THE Prompt_Translator SHALL return the translated prompt as a plain string, with a maximum length of 800 characters.
4. IF the Prompt_Translator call fails, THEN THE Image_Composer SHALL fall back to a deterministic English prompt constructed from the company's stored fields, without blocking image generation.
5. FOR ALL valid company profiles with non-empty `description` and `sector` fields, THE Prompt_Translator SHALL produce a prompt that contains at least one reference to the company's sector or description content (verifiable by substring check in tests).

---

### Requirement 16: Image Generation — Text Overlay Quality

**User Story:** As a user, I want text overlaid on generated images to be fully visible and well-positioned, so that the final marketing post looks professional and the headline is never cut off.

#### Acceptance Criteria

1. THE Image_Composer SHALL calculate the overlay panel height dynamically based on the actual number of wrapped text lines, the font size, and the line height, ensuring the panel is always tall enough to contain all text without clipping.
2. WHEN the `composeMarketingPost` function is called with a headline longer than 40 characters, THE Image_Composer SHALL wrap the headline across multiple lines, with each line fitting within the image width minus horizontal padding.
3. THE Image_Composer SHALL enforce a maximum of 2 lines for the headline and 3 lines for the body text, truncating with an ellipsis (`…`) if the text exceeds those limits.
4. THE Image_Composer SHALL position the text overlay so that the bottom edge of the last text element is at least `padBottom` pixels above the bottom edge of the image, preventing text from being clipped by the image boundary.
5. WHEN the overlay panel height exceeds 45% of the image height, THE Image_Composer SHALL reduce font sizes proportionally (by up to 20%) to keep the overlay within that limit.
6. THE Image_Composer SHALL ensure a minimum contrast ratio of 4.5:1 between overlay text and the overlay background color, as defined by WCAG 2.1 AA, by selecting white or dark text based on the background luminance.
7. FOR ALL valid inputs to `composeMarketingPost` with any non-empty `headline` string of length 1 to 200 characters, THE Image_Composer SHALL produce an output image whose dimensions equal the input image dimensions (invariant property).

---

### Requirement 17: Image Generation — Aspect Ratio per Platform

**User Story:** As a user, I want generated images to have the correct aspect ratio for each social media platform, so that images display without cropping or letterboxing.

#### Acceptance Criteria

1. THE Image_Composer SHALL generate images with aspect ratio `1:1` (1024×1024 px) for `instagram` and `whatsapp` platforms.
2. THE Image_Composer SHALL generate images with aspect ratio `16:9` (1344×768 px or equivalent) for `facebook` and `linkedin` platforms.
3. WHEN the `generateImageWithBedrock` function is called, THE Bedrock_Client SHALL pass the platform-appropriate `aspect_ratio` parameter to the Stable Diffusion Ultra API.
4. THE Image_Composer SHALL accept the `platform` parameter and select the correct canvas dimensions before composing text overlays, so that overlays are sized relative to the actual output dimensions.

---

### Requirement 18: Performance — Caching

**User Story:** As a platform operator, I want frequently read data cached at the API layer, so that database load is reduced and response times are improved for common requests.

#### Acceptance Criteria

1. THE Platform SHALL cache the result of `GET /api/company` per authenticated user with a TTL of 5 minutes, invalidating the cache when `POST /api/company` is called for that user.
2. THE Platform SHALL cache the result of `GET /api/costs` per company with a TTL of 2 minutes.
3. THE Platform SHALL implement caching using an in-process LRU cache (for single-instance deployments) or Redis (for multi-instance deployments), configurable via the `CACHE_PROVIDER` environment variable.
4. WHEN a cache decision is made, THE API_Route SHALL include a `X-Cache: HIT` header if the response was served from cache, or a `X-Cache: MISS` header if a fresh response was computed; IF adding the `X-Cache: HIT` header fails due to a technical issue, THEN THE API_Route SHALL treat it as an error and compute a fresh response instead.

---

### Requirement 19: Performance — Database Query Optimization

**User Story:** As a developer, I want database queries optimized with proper indexes and pagination, so that the platform remains responsive as data volume grows.

#### Acceptance Criteria

1. THE Repository SHALL add database indexes on: `Post.companyId`, `Post.status`, `Post.scheduledAt`, `CostLog.companyId`, `CostLog.createdAt`, and `SocialAccount.companyId`.
2. THE Platform SHALL implement cursor-based or offset pagination on `GET /api/posts`, accepting `page` and `pageSize` query parameters (default `pageSize` of 20, maximum of 100); WHEN a client requests a `pageSize` greater than 100, THE API_Route SHALL return HTTP 400.
3. THE Platform SHALL implement cursor-based or offset pagination on `GET /api/costs`, accepting `page` and `pageSize` query parameters (default `pageSize` of 50, maximum of 200); WHEN a client requests a `pageSize` greater than 200, THE API_Route SHALL return HTTP 400.
4. THE Repository SHALL never execute a `findMany` query without a `take` limit clause, preventing unbounded result sets.
5. WHEN a `GET /api/posts` request is made, THE API_Route SHALL return a response body containing both the paginated `data` array and a `pagination` object with `total`, `page`, `pageSize`, and `hasNextPage` fields; the `data` array and `pagination` object SHALL always appear together in the same response.

---

### Requirement 20: Scalability — Stateless Application Design

**User Story:** As a platform operator, I want the application to be stateless, so that it can be horizontally scaled by running multiple instances behind a load balancer.

#### Acceptance Criteria

1. THE Platform SHALL store no user session state in server memory; all session data SHALL be stored in the database via the NextAuth Prisma adapter or in a distributed session store.
2. THE Platform SHALL store no in-flight request state in module-level variables; all shared state SHALL be stored in the database or cache layer.
3. THE Platform SHALL store uploaded files in an external object store (AWS S3 or compatible), not in the local `public/uploads/` directory, configurable via `STORAGE_PROVIDER` and `STORAGE_BUCKET` environment variables.
4. WHEN `STORAGE_PROVIDER=s3` is configured, THE Platform SHALL upload files to S3 and return a public CDN URL, not a local file path.
5. WHERE `STORAGE_PROVIDER=local` is configured (development only), THE Platform SHALL continue to store files in `public/uploads/` and return local paths; IF a file upload fails or no file is provided, THEN THE Platform SHALL return `null` to indicate no file path.

---

### Requirement 21: CI/CD Pipeline

**User Story:** As a developer, I want an automated CI pipeline that runs lint, type-check, and tests on every pull request, so that regressions are caught before code is merged.

#### Acceptance Criteria

1. THE Platform SHALL provide a GitHub Actions workflow file at `.github/workflows/ci.yml` that runs on every push to `main` and on every pull request.
2. THE CI pipeline SHALL execute the following steps in order: install dependencies, run `npm run lint`, run `npm run type-check`, run `npm test -- --run`.
3. WHEN any CI step fails, THE CI pipeline SHALL mark the pull request check as failed and prevent merging; IF branch protection rules are not properly configured in the repository, THEN THE CI pipeline SHALL fail entirely, forcing proper repository configuration before merging is permitted.
4. THE Platform SHALL add a `type-check` script to `package.json` that runs `tsc --noEmit` to verify TypeScript compilation without producing output files.
5. THE CI pipeline SHALL complete all steps within 5 minutes on a standard GitHub Actions runner.
