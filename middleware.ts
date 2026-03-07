// ---------------------------------------------------------------------------
// GardenOS – Middleware: Protect all routes except auth + public assets
// ---------------------------------------------------------------------------
// Uses getToken() from next-auth/jwt instead of the full auth() wrapper so
// that Prisma is NOT imported in the Edge Runtime.
// ---------------------------------------------------------------------------
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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

  // Allow static assets & Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/leaflet") ||
    pathname.match(/\.(ico|png|svg|jpg|jpeg|gif|webp|css|js|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  // Decode JWT – works in Edge Runtime, no DB call needed
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

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
