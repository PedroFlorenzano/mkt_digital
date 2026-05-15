import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { performanceMonitorService } from "@server/services/performance-monitor.service";

/**
 * Timing-safe string comparison to prevent timing attacks on the CRON_SECRET.
 * Returns false immediately if lengths differ (no timing leak since length mismatch
 * is not secret information — the expected length is the secret).
 */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * GET /api/cron/paid-traffic-monitor
 *
 * Cron endpoint that triggers a full performance monitoring cycle for all active
 * AI Paid Traffic campaigns.
 *
 * Security: requires `Authorization: Bearer <CRON_SECRET>` header.
 * Not wrapped in withErrorHandler — authentication is performed before any service
 * calls, and errors are handled manually.
 */
export async function GET(request: Request) {
  // Validate Authorization header
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET ?? "";

  if (
    !authHeader ||
    !timingSafeEqual(authHeader, `Bearer ${cronSecret}`)
  ) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const result = await performanceMonitorService.runCycle();
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[cron/paid-traffic-monitor] Unhandled error during runCycle", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
