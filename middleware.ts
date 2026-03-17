// ---------------------------------------------------------------------------
// GardenOS – Middleware: Protect all routes except auth + public assets
// ---------------------------------------------------------------------------
// Uses getToken() from next-auth/jwt instead of the full auth() wrapper so
// that Prisma is NOT imported in the Edge Runtime.
// Auth.js v5 uses "authjs.session-token" as cookie name (not "next-auth.*").
// ---------------------------------------------------------------------------
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Auth.js v5 cookie name depends on protocol
const COOKIE_NAME_HTTP = "authjs.session-token";
const COOKIE_NAME_HTTPS = "__Secure-authjs.session-token";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow auth-related routes
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Allow static assets, PWA manifest & Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/leaflet") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.match(/\.(ico|png|svg|jpg|jpeg|gif|webp|css|js|json|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  // Pick the right cookie name based on protocol
  const isSecure = req.nextUrl.protocol === "https:";
  const cookieName = isSecure ? COOKIE_NAME_HTTPS : COOKIE_NAME_HTTP;

  // Decode JWT – works in Edge Runtime, no DB call needed
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    cookieName,
  });

  // Not logged in → redirect to login
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin page requires admin role
  if (pathname.startsWith("/admin")) {
    if (token.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all routes except static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
