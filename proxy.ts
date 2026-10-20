import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "./auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow auth API routes and static assets
  if (
    pathname.startsWith("/api/auth") ||
    // Public self-service signup logo upload (user has no session yet)
    pathname.startsWith("/api/signup") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    // Public files served from /public (logo, images, fonts, etc.)
    /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|txt|xml)$/i.test(
      pathname
    )
  ) {
    return NextResponse.next();
  }

  // Public routes
  const publicRoutes = ["/", "/login", "/signup"];
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Get session
  const session = await auth();

  // Redirect unauthenticated users to login
  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Protect /admin/* — require SUPER_ADMIN
  if (pathname.startsWith("/admin")) {
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Protect /tickets/* and /api/tickets/* — require authenticated user (already checked above)
  // Additional check: non-SUPER_ADMIN must have an agencyId
  if (
    (pathname.startsWith("/tickets") || pathname.startsWith("/api/tickets")) &&
    session.user.role !== "SUPER_ADMIN" &&
    !session.user.agencyId
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
