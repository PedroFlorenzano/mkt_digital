# Implementation Plan: Content Suite Expansion

## Overview

This plan implements the ten new capabilities of the Content Suite Expansion in incremental steps. Each step builds on the previous, starting with the database foundation and shared infrastructure, then individual feature services, API routes, and React components, and ending with full integration and wiring. All code is TypeScript, following the existing project conventions (Next.js App Router, Prisma/SQLite, AWS Bedrock, Jest + ts-jest + fast-check).

---

## Tasks

- [x] 1. Database migration and Prisma schema changes
  - Add `format`, `slidesJson`, `boostSuggestionJson`, `boostCampaignId`, and `gridOrder` optional fields to `Post` model
  - Add `sourcePostId` and `boostConfirmedAt` optional fields to `AdCampaign` model
  - Add composite indexes `@@index([companyId, format])` and `@@index([companyId, platform, status])` to `Post`, and `@@index([sourcePostId])` to `AdCampaign`
  - Run `npx prisma migrate dev --name content_suite_expansion` to generate and apply migration
  - Verify all new fields are optional (`?`) and that existing rows are unaffected
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 2. Shared infrastructure: error classes and Bedrock/social lib extensions
  - [x] 2.1 Verify and extend `src/server/lib/errors.ts` to confirm `ValidationError`, `ForbiddenError`, `ExternalServiceError`, and `NotFoundError` exist with correct HTTP codes; add any missing ones
    - _Requirements: 1.5, 1.7, 2.1, 3.5, 4.5, 5.8, 7.5, 9.6_
  - [x] 2.2 Extend `src/server/lib/bedrock.ts` to support `aspect_ratio` parameter in `generateImageWithBedrock` calls, and add a `count` parameter for generating multiple images in a single call
    - _Requirements: 1.1, 3.1, 4.2_
  - [x] 2.3 Add `publishCarouselToInstagram`, `publishReelToInstagram`, and `publishStoryToInstagram` functions to `src/server/lib/social.ts`, each returning a `SocialPublishResult`
    - _Requirements: 1.4, 2.4, 3.3, 3.4_

- [x] 3. Carousel_Builder service and API route
  - [x] 3.1 Create `src/server/services/carousel.service.ts` implementing `buildCarousel(slides: Slide[]): CarouselResult` and `reorderSlides(current, fromIndex, toIndex): Slide[]`
    - `buildCarousel` throws `ValidationError` if `slideCount < 3 || slideCount > 10`
    - `reorderSlides` preserves the full set of slide IDs (no losses, no duplicates)
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_
  - [ ]* 3.2 Write property test for carousel slide count invariant (Property 1)
    - **Property 1: Invariante de cardinalidade de slides do carrossel**
    - **Validates: Requirements 1.1, 1.5, 1.6**
  - [ ]* 3.3 Write property test for carousel reorder invariant (Property 2)
    - **Property 2: Invariante de reordenação do carrossel**
    - **Validates: Requirements 1.3**
  - [ ]* 3.4 Write unit tests for `carousel.service`
    - Test `buildCarousel` with 3, 5, and 10 slides (valid)
    - Test `buildCarousel` rejection with 2 and 11 slides
    - Test `reorderSlides` preserves content across multiple reorder operations
    - _Requirements: 1.1, 1.3, 1.5_
  - [x] 3.5 Create API route `src/app/api/generate/carousel/route.ts`
    - Accepts `{ companyId, topic, slideCount }`, calls `carousel.service`, persists `Post` with `format="carousel"` and `slidesJson`
    - On Instagram API failure, keeps post as `"draft"` and surfaces error message
    - _Requirements: 1.1, 1.2, 1.7_

- [x] 4. Checkpoint — carousel baseline
  - Ensure all carousel tests pass, ask the user if questions arise.

- [x] 5. Reel Publisher service and API route
  - [x] 5.1 Create `src/server/services/reel.service.ts` implementing `validateReelPublish(input: ReelPublishInput): void`
    - Throws `ValidationError` if `durationSeconds` outside `[15, 60]`
    - Throws `ValidationError` if `SocialAccount.connected !== true`
    - Throws `ValidationError` if `videoUrl` is absent
    - Integrates with existing video-generation pipeline, validates generated video duration
    - Generates caption (≤ 2,200 chars) and 5–30 hashtags via `generateTextWithBedrock`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [ ]* 5.2 Write property test for Reel duration invariant (Property 3)
    - **Property 3: Invariante de duração do Reel**
    - **Validates: Requirements 2.1, 2.2**
  - [ ]* 5.3 Write unit tests for `reel.service`
    - `validateReelPublish` accepts boundary values 15 s and 60 s
    - `validateReelPublish` rejects 14 s and 61 s
    - `validateReelPublish` rejects missing `videoUrl`
    - _Requirements: 2.1, 2.4, 2.6_
  - [x] 5.4 Create API route `src/app/api/generate/reel-caption/route.ts` for caption + hashtag generation
    - _Requirements: 2.3_
  - [x] 5.5 Extend social publish route `src/app/api/social/publish/route.ts` (or equivalent) to handle `format="reel"` via `publishReelToInstagram`
    - On API failure, marks post `"error"` without retry
    - _Requirements: 2.4, 2.5, 2.6_

- [x] 6. Story Publisher service and API route
  - [x] 6.1 Create `src/server/services/story.service.ts` implementing `isValidStoryAspectRatio`, `generateStoryImage`, and scheduling validation
    - `isValidStoryAspectRatio` verifies `abs(width * 16 - height * 9) ≤ 25` (tolerance of ±1px per dimension)
    - `generateStoryImage` retries up to 2 times on invalid aspect ratio, then throws `ExternalServiceError`
    - Scheduling validation rejects `scheduledAt > Date.now() + 24h` for story posts
    - Includes `objective` from `Company` in Stable Diffusion prompt
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7_
  - [ ]* 6.2 Write property test for Story aspect ratio invariant (Property 4)
    - **Property 4: Invariante de proporção do Story**
    - **Validates: Requirements 3.1, 3.7**
  - [ ]* 6.3 Write unit tests for `story.service`
    - `isValidStoryAspectRatio` with exact dimensions, ±1 px, and out-of-tolerance values
    - Scheduling validator rejects `scheduledAt > now + 24h`
    - _Requirements: 3.1, 3.6_
  - [x] 6.4 Create API route `src/app/api/generate/story/route.ts`
    - _Requirements: 3.1, 3.2_
  - [x] 6.5 Extend social publish route to handle `format="story"` via `publishStoryToInstagram`
    - Handles both image (`media_type=IMAGE, is_stories=true`) and video (`media_type=VIDEO, is_stories=true`) stories
    - On API failure, marks post `"error"`
    - _Requirements: 3.3, 3.4, 3.5_

- [x] 7. Checkpoint — new format services
  - Ensure all Reel and Story tests pass, ask the user if questions arise.

- [x] 8. Variation Service (brand-aware image generation)
  - [x] 8.1 Create `src/server/services/variation.service.ts` implementing `buildBrandPrompt(base, ctx): string`
    - Injects all hex color values, `tone`, and `sector` from `BrandContext` into the prompt
    - When `colors` is empty/null, uses only `tone` and `sector` and sets a warning flag
    - _Requirements: 4.1, 4.4_
  - [ ]* 8.2 Write property test for Brand_Context presence in prompt (Property 5)
    - **Property 5: Brand_Context sempre presente no prompt de imagem**
    - **Validates: Requirements 4.1**
  - [ ]* 8.3 Write property test for variation accumulation invariant (Property 6)
    - **Property 6: Cardinalidade e acumulação de variações**
    - **Validates: Requirements 4.2, 4.3**
  - [ ]* 8.4 Write unit tests for `variation.service`
    - `buildBrandPrompt` contains hex values from `colors`
    - Warning returned when `colors` is empty
    - _Requirements: 4.1, 4.4_
  - [x] 8.5 Integrate `variation.service` into the image generation call within `carousel.service`, `story.service`, and the existing post creation flow so all image generation includes `BrandContext`
    - _Requirements: 4.1, 4.2_

- [x] 9. Boost_Advisor service and API route
  - [x] 9.1 Create `src/server/services/boost.service.ts` implementing `analyzePost` and `confirmBoost`
    - `analyzePost` uses `generateTextWithBedrock` with `BrandContext` to produce `BoostSuggestion` (budget R$5–300, duration 1–30 days); throws `ExternalServiceError` on Bedrock failure
    - `confirmBoost` verifies existence of `CampaignAuditLog { userDecision: "approved" }` before creating `AdCampaign`; throws `ForbiddenError` if log not found; sets `boostConfirmedAt`
    - If no valid credentials, returns text briefing without creating `AdCampaign`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  - [ ]* 9.2 Write property test for Boost safety invariant (Property 7)
    - **Property 7: Safety — nenhuma Boost_Campaign sem confirmação**
    - **Validates: Requirements 5.3, 5.6**
  - [ ]* 9.3 Write unit tests for `boost.service`
    - `confirmBoost` throws `ForbiddenError` when no approved `CampaignAuditLog` exists
    - `confirmBoost` creates `AdCampaign` with `campaignType="boost"` and `boostConfirmedAt` when log exists
    - Bedrock failure triggers `ExternalServiceError` without creating any records
    - _Requirements: 5.4, 5.6, 5.8_
  - [x] 9.4 Create API route `src/app/api/posts/[id]/boost/route.ts`
    - GET: calls `analyzePost`, returns `BoostSuggestion`
    - POST: records `CampaignAuditLog` with `userDecision="approved"`, then calls `confirmBoost`
    - Records API ad-platform errors in `CampaignAuditLog.metadata` without deleting the approval log
    - _Requirements: 5.1, 5.3, 5.4, 5.7_

- [x] 10. Strategic_Analyst service and API route
  - [x] 10.1 Create `src/server/services/strategic-analyst.service.ts` implementing `generateDiagnosis` and `applyRouteChange`
    - `generateDiagnosis` filters campaigns with ≥ 7 days of metric snapshots in the last 30 days; returns informative message when none qualify
    - Returns `StrategicDiagnosis` with `strengths`, `alerts`, and exactly 3 `RouteChange`s
    - Strength criteria: ROAS > 2× portfolio avg or CTR > 3%; alert criteria: CTR < 1%, ROAS < 1.5, or CPC > 2× benchmark
    - `applyRouteChange` validates `CampaignAuditLog` for destructive types (`budget | audience | pause`); editorial types execute immediately
    - Records each action and error in `CampaignAuditLog` with `source="strategic_analyst"`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [ ]* 10.2 Write property test for Route_Change count invariant (Property 8)
    - **Property 8: Cardinalidade de Route_Changes**
    - **Validates: Requirements 6.2**
  - [ ]* 10.3 Write unit tests for `strategic-analyst.service`
    - `generateDiagnosis` returns exactly 3 `RouteChange`s when campaigns have sufficient data
    - Returns informative message (no partial diagnosis) when no active campaigns or insufficient data
    - `applyRouteChange` rejects destructive types without approved `CampaignAuditLog`
    - _Requirements: 6.2, 6.5, 6.6_
  - [x] 10.4 Create API route `src/app/api/paid-traffic/strategy/route.ts`
    - GET: calls `generateDiagnosis`
    - POST: calls `applyRouteChange`; records `userDecision="approved"` or `"rejected"` in `CampaignAuditLog`
    - _Requirements: 6.1, 6.4, 6.8_

- [x] 11. Checkpoint — boost and strategy services
  - Ensure all boost and strategic-analyst tests pass, ask the user if questions arise.

- [x] 12. Bio_Generator service and API route
  - [x] 12.1 Create `src/server/services/bio.service.ts` implementing `generateBioSuggestions(companyId): Promise<BioSuggestion[]>`
    - Validates `name`, `sector`, and `objective` before invoking Bedrock; throws `ValidationError` if any is missing
    - Returns exactly 3 `BioSuggestion` items, each ≤ 150 chars, with at least 1 emoji and a CTA
    - Throws `ExternalServiceError` after 30-second timeout
    - _Requirements: 7.1, 7.2, 7.4, 7.5_
  - [ ]* 12.2 Write property test for bio length invariant (Property 9)
    - **Property 9: Invariante de comprimento das sugestões de bio**
    - **Validates: Requirements 7.2**
  - [ ]* 12.3 Write property test for bio count invariant (Property 10)
    - **Property 10: Cardinalidade das sugestões de bio**
    - **Validates: Requirements 7.1**
  - [ ]* 12.4 Write unit tests for `bio.service`
    - `generateBioSuggestions` throws `ValidationError` when `name`, `sector`, or `objective` are missing — without calling Bedrock
    - Bedrock failure triggers `ExternalServiceError` without saving partial data
    - _Requirements: 7.4, 7.5_
  - [x] 12.5 Create API route `src/app/api/instagram/bio/route.ts`
    - Calls `generateBioSuggestions`; response includes a UI-level warning that bio must be applied manually on Instagram
    - _Requirements: 7.1, 7.3_

- [x] 13. Feed_Grid service and API route
  - [x] 13.1 Create `src/server/services/feed-grid.service.ts` implementing `getFeedGrid` and `reorderGrid`
    - `getFeedGrid` returns only `platform="instagram"` posts: published posts ordered desc by `publishedAt`, then scheduled/draft ordered asc by `scheduledAt || createdAt`
    - `reorderGrid` persists new `gridOrder` for non-published posts only; throws `ForbiddenError` if any published post is in the reorder set
    - Empty state returned when no instagram posts exist
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [ ]* 13.2 Write property test for published-post immutability invariant (Property 11)
    - **Property 11: Imutabilidade da ordem de posts publicados no Feed_Grid**
    - **Validates: Requirements 8.2, 8.3, 8.6**
  - [ ]* 13.3 Write unit tests for `feed-grid.service`
    - `reorderGrid` blocks moves of published posts
    - `reorderGrid` persists new order for draft/scheduled posts across sessions
    - `getFeedGrid` returns only Instagram posts
    - _Requirements: 8.2, 8.3, 8.4, 8.6_
  - [x] 13.4 Create API route `src/app/api/instagram/grid/route.ts`
    - GET: calls `getFeedGrid`
    - PATCH: calls `reorderGrid` with new ordered post IDs
    - _Requirements: 8.1, 8.2_

- [x] 14. Profile_Auditor service and API route
  - [x] 14.1 Create `src/server/services/profile-auditor.service.ts` implementing `auditProfile(companyId, input: AuditInput): Promise<AuditResult>`
    - Validates all four required fields (bio, followers, engagementRate, niche) before invoking Bedrock
    - Returns `AuditResult` with integer `score` in `[0, 100]`, per-component evaluations, and ≥ 3 recommendations aligned to `Company.objective`
    - Throws `ExternalServiceError` on Bedrock failure without saving partial data
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [ ]* 14.2 Write property test for audit score range invariant (Property 12)
    - **Property 12: Faixa de pontuação da auditoria de perfil**
    - **Validates: Requirements 9.3**
  - [ ]* 14.3 Write unit tests for `profile-auditor.service`
    - `auditProfile` throws `ValidationError` when any required field is missing — without calling Bedrock
    - Bedrock failure results in `ExternalServiceError` without saving partial data
    - _Requirements: 9.4, 9.6_
  - [x] 14.4 Create API route `src/app/api/instagram/audit/route.ts`
    - POST: calls `auditProfile`, returns structured `AuditResult`
    - _Requirements: 9.1, 9.5_

- [x] 15. Checkpoint — Instagram profile management services
  - Ensure all bio, feed-grid, and profile-auditor tests pass, ask the user if questions arise.

- [x] 16. React components — Carousel editor
  - [x] 16.1 Create `src/client/components/CarouselEditor.tsx` with drag-and-drop slide reordering using the existing UI library
    - Calls `reorderSlides` on drop, updates local state, and PATCHes the updated `slidesJson` to the API
    - Each slide shows its image and an editable headline (≤ 60 chars enforced in UI)
    - _Requirements: 1.3_
  - [x] 16.2 Integrate carousel format option into the existing post creation form
    - Adds "Carrossel" format selector; on selection, renders `CarouselEditor` and wires slide-count picker (3–10)
    - _Requirements: 1.1, 1.2_

- [x] 17. React components — Reel and Story creation UIs
  - [x] 17.1 Add "Reels" format option to post creation form
    - Video upload input with client-side duration validation (15–60 s) before submitting
    - "Gerar legenda" button calls `/api/generate/reel-caption`
    - _Requirements: 2.1, 2.3_
  - [x] 17.2 Add "Stories" format option to post creation form
    - Calls `/api/generate/story`; displays generated 9:16 preview
    - Client-side scheduling guard: disables `scheduledAt` input > 24 h from now
    - _Requirements: 3.1, 3.6_

- [x] 18. React components — Image variations panel
  - [x] 18.1 Create `src/client/components/VariationsPanel.tsx`
    - Displays initial `Variation_Set` (3 images) returned from generation
    - "Gerar mais variações" button appends 3 more images to the existing list (accumulated in React state, not persisted to DB)
    - Shows inline warning when company has no color palette (`colors` null/empty)
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 18.2 Integrate `VariationsPanel` into carousel, story, and standard post creation forms
    - _Requirements: 4.1, 4.2_

- [x] 19. React components — Post Boost UI
  - [x] 19.1 Create `src/client/components/BoostAdvisor.tsx`
    - "Turbinar" button visible only on posts with `status="published"` or `"scheduled"`
    - Calls GET `/api/posts/[id]/boost`, displays `BoostSuggestion`
    - If no valid ad credentials, displays briefing text only (no "Confirm" button)
    - "Confirmar Turbinação" button triggers POST and shows `Confirmation_Event` modal before calling the API
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 20. React components — Strategic Analyst UI
  - [x] 20.1 Create `src/client/components/StrategicDashboard.tsx` in the paid traffic module
    - "Analisar Estratégia" button calls GET `/api/paid-traffic/strategy`
    - Renders `StrategicDiagnosis`: strengths, alerts, and exactly 3 Route_Change cards
    - Destructive Route_Change cards show "Aprovar" button (with confirmation modal); editorial cards execute immediately
    - "Rejeitar" button records rejection without calling ad platform
    - _Requirements: 6.2, 6.3, 6.4, 6.7, 6.8_

- [x] 21. React components — Instagram profile management
  - [x] 21.1 Create `src/client/components/BioGenerator.tsx`
    - "Sugerir Bio" button calls GET `/api/instagram/bio`
    - Displays 3 bio suggestions with "Copiar" buttons; shows persistent inline notice that bio must be applied manually on the Instagram app
    - _Requirements: 7.1, 7.3_
  - [x] 21.2 Create `src/client/components/FeedGridPlanner.tsx`
    - Renders 3×3 grid of `FeedGridPost` items
    - Drag-and-drop enabled only for non-published posts; drag attempts on published posts are silently blocked
    - Empty state with CTA when no posts exist
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_
  - [x] 21.3 Create `src/client/components/ProfileAuditor.tsx`
    - Form with bio, followers, engagement rate (%), and niche inputs
    - Calls POST `/api/instagram/audit`; displays `AuditResult` with score meter, per-component breakdown, and recommendations
    - _Requirements: 9.1, 9.4, 9.5_

- [x] 22. Final checkpoint — integration and wiring
  - Wire all new components into their respective Next.js page routes under `/create-post`, `/posts`, `/paid-traffic`, and `/instagram-profile`
  - Run full test suite and ensure all tests pass; ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP delivery.
- Each task references specific requirements for traceability.
- Checkpoints at tasks 4, 7, 11, 15, and 22 provide incremental validation gates.
- Property-based tests (Properties 1–12) validate universal correctness invariants and use `fast-check@3.23.2` — install with `npm install --save-dev fast-check@3.23.2` if not already present.
- Unit tests complement property tests by validating specific examples and error paths.
- All new Prisma fields are optional with defaults, ensuring zero-downtime, non-breaking migration.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1", "5.1", "6.1", "8.1", "9.1", "10.1", "12.1", "13.1", "14.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "5.2", "5.3", "5.4", "5.5", "6.2", "6.3", "6.4", "6.5", "8.2", "8.3", "8.4", "8.5", "9.2", "9.3", "9.4", "10.2", "10.3", "10.4", "12.2", "12.3", "12.4", "12.5", "13.2", "13.3", "13.4", "14.2", "14.3", "14.4"] },
    { "id": 4, "tasks": ["16.1", "16.2", "17.1", "17.2", "18.1", "19.1", "20.1", "21.1", "21.2", "21.3"] },
    { "id": 5, "tasks": ["18.2"] }
  ]
}
```
