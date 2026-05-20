import { ValidationError } from "@server/lib/errors";

/** Minimum number of slides in a valid carousel. */
const MIN_SLIDES = 3;

/** Maximum number of slides in a valid carousel. */
const MAX_SLIDES = 10;

/** Maximum number of characters allowed in a slide headline. */
const MAX_HEADLINE_LENGTH = 60;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * A single slide within a carousel post.
 *
 * `id` is a cuid assigned by the server at creation time.
 * `imageUrl` may be a public URL or a base64 data URL.
 * `headline` must not exceed 60 characters.
 * `order` is the 0-indexed display position of the slide.
 */
export interface Slide {
  /** Unique identifier for the slide (cuid). */
  id: string;
  /** Image source — either a publicly accessible URL or a base64 data URL. */
  imageUrl: string;
  /** Short text displayed on the slide. Max 60 characters. */
  headline: string;
  /** 0-indexed display position of the slide within the carousel. */
  order: number;
}

/**
 * The result produced by `buildCarousel`.
 *
 * `slides` is the validated, ordered array of slides.
 * `slidesJson` is the JSON-serialised representation of `slides`, ready to be
 * stored in the `Post.slidesJson` field (SQLite does not support native arrays).
 */
export interface CarouselResult {
  /** Validated slides with `order` values assigned from 0 upwards. */
  slides: Slide[];
  /** `JSON.stringify(slides)` — ready for storage in `Post.slidesJson`. */
  slidesJson: string;
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Validates and builds a `CarouselResult` from the provided slides array.
 *
 * Validation rules (checked in order):
 * 1. The array must contain between 3 and 10 slides (inclusive). If the count
 *    is outside this range a `ValidationError` is thrown immediately and no
 *    data is written.
 * 2. Every slide's `headline` must be at most 60 characters. The first
 *    offending slide causes a `ValidationError` to be thrown.
 *
 * On success, each slide's `order` property is reassigned to its 0-indexed
 * position in the input array (normalising any pre-existing `order` values).
 * The function is pure — the original `slides` array is not mutated.
 *
 * @param slides - The candidate slides to validate and serialise.
 * @returns A `CarouselResult` with the ordered slides and their JSON encoding.
 * @throws {ValidationError} if `slides.length < 3 || slides.length > 10`.
 * @throws {ValidationError} if any `slide.headline.length > 60`.
 */
export function buildCarousel(slides: Slide[]): CarouselResult {
  const count = slides.length;

  if (count < MIN_SLIDES || count > MAX_SLIDES) {
    throw new ValidationError(
      `Carousel must have between ${MIN_SLIDES} and ${MAX_SLIDES} slides. Received: ${count}.`,
      { received: count, min: MIN_SLIDES, max: MAX_SLIDES },
    );
  }

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (!slide) continue; // type-narrowing guard for noUncheckedIndexedAccess
    if (slide.headline.length > MAX_HEADLINE_LENGTH) {
      throw new ValidationError(
        `Slide at index ${i} has a headline of ${slide.headline.length} characters, ` +
          `which exceeds the maximum of ${MAX_HEADLINE_LENGTH}.`,
        { slideIndex: i, headlineLength: slide.headline.length, max: MAX_HEADLINE_LENGTH },
      );
    }
  }

  // Assign normalised order values (0-indexed) without mutating the originals.
  const orderedSlides: Slide[] = slides.map((slide, index) => ({
    ...slide,
    order: index,
  }));

  return {
    slides: orderedSlides,
    slidesJson: JSON.stringify(orderedSlides),
  };
}

/**
 * Moves the slide at `fromIndex` to `toIndex`, shifting all intermediate
 * slides accordingly, and returns the rearranged array.
 *
 * This is a pure function: the `current` array is never mutated. The returned
 * array contains exactly the same slide objects (by reference) as `current`
 * — no slides are added or removed. `order` values are reassigned to reflect
 * the new positions.
 *
 * @param current   - The current ordered list of slides.
 * @param fromIndex - 0-based index of the slide to move.
 * @param toIndex   - 0-based destination index.
 * @returns A new `Slide[]` with the slide moved and `order` values updated.
 * @throws {ValidationError} if `fromIndex` or `toIndex` is out of bounds.
 */
export function reorderSlides(
  current: Slide[],
  fromIndex: number,
  toIndex: number,
): Slide[] {
  const length = current.length;

  if (fromIndex < 0 || fromIndex >= length) {
    throw new ValidationError(
      `fromIndex ${fromIndex} is out of bounds for an array of length ${length}.`,
      { fromIndex, length },
    );
  }

  if (toIndex < 0 || toIndex >= length) {
    throw new ValidationError(
      `toIndex ${toIndex} is out of bounds for an array of length ${length}.`,
      { toIndex, length },
    );
  }

  // Build a shallow copy, remove the slide from its current position, then
  // insert it at the destination.
  const reordered = [...current];
  const [moved] = reordered.splice(fromIndex, 1);

  // After the splice `moved` is guaranteed to be defined because we validated
  // the index above, but we need to satisfy TypeScript strict null checks.
  if (!moved) {
    throw new ValidationError(`Unexpected error: no slide found at index ${fromIndex}.`);
  }

  reordered.splice(toIndex, 0, moved);

  // Reassign order to reflect the new positions.
  return reordered.map((slide, index) => ({ ...slide, order: index }));
}
