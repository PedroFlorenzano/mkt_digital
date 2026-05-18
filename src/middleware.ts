import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Public routes that do not require authentication.
 * The root "/" is matched exactly; the others also match any sub-path.
 */
function isPublicRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  const publicPrefixes = ["/login", "/register", "/company-selector"];
  return publicPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

/**
 * API routes that require authentication but NOT an active company.
 * Used to load the company list and to execute the company selection.
 */
function isApiRouteNoCompanyRequired(pathname: string): boolean {
  return (
    pathname === "/api/companies" ||
    pathname.startsWith("/api/companies/select")
  );
}

/**
 * Dashboard (page) routes that are accessible without an active company.
 * The onboarding page in create mode is used to set up the first/new company.
 */
function isDashboardRouteNoCompanyRequired(pathname: string): boolean {
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. NextAuth routes always pass through ──────────────────────────────────
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // ── 2. Next.js internals / static assets pass through ───────────────────────
  //    (Belt-and-suspenders: the matcher already excludes most of these)
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api");
  const isPublic = isPublicRoute(pathname);

  // A "dashboard route" is: explicitly starts with /dashboard, or
  // anything that is neither a public route nor an API route.
  const isDashboardRoute =
    pathname.startsWith("/dashboard") || (!isPublic && !isApiRoute);

  // ── 3. Decode JWT ────────────────────────────────────────────────────────────
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // ── 4. Public route handling ─────────────────────────────────────────────────
  if (isPublic) {
    if (token !== null) {
      // Authenticated user visiting /login → redirect to appropriate destination
      if (pathname === "/login" || pathname.startsWith("/login/")) {
        if (token.activeCompanyId) {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        } else {
          return NextResponse.redirect(
            new URL("/company-selector", request.url)
          );
        }
      }
    }
    // All other public routes (including /company-selector itself) pass through
    return NextResponse.next();
  }

  // ── 5. Unauthenticated request ───────────────────────────────────────────────
  if (!token) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── 6. Authenticated but no active company ───────────────────────────────────
  //    Dashboard routes always require an active company, except /onboarding
  //    (used to create the first/new company).
  //    API routes require it too, except the company-list and company-select
  //    endpoints that are used to populate and submit the selector itself.
  const noCompanyRequired =
    isApiRouteNoCompanyRequired(pathname) ||
    isDashboardRouteNoCompanyRequired(pathname);

  if (
    (isDashboardRoute || (isApiRoute && !noCompanyRequired)) &&
    !token.activeCompanyId
  ) {
    if (isApiRoute) {
      return NextResponse.json(
        { error: "No active company selected" },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/company-selector", request.url));
  }

  // ── 7. Valid, fully-authenticated request ────────────────────────────────────
  //    Forward user identity headers so API routes can skip an extra JWT decode.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", token.id);
  requestHeaders.set("x-active-company-id", token.activeCompanyId ?? "");

  return NextResponse.next({ request: { headers: requestHeaders } });
}

// Exclude Next.js internals and static assets from the middleware pipeline
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
