import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get("docally-auth");
  const isAuthed = authCookie?.value === "authenticated";

  const path = request.nextUrl.pathname;

  // Public endpoints: SSO, login, and Stripe webhook
  if (
    path.startsWith("/auth") ||
    path.startsWith("/login") ||
    path === "/api/credits/webhook"
  ) {
    return NextResponse.next();
  }

  // Protected pages: upload requires email login for usage tracking
  const isProtectedPage = path.startsWith("/upload") || path.startsWith("/admin");
  const isProtectedApi =
    path.startsWith("/api/process-syllabus") ||
    path.startsWith("/api/admin") ||
    path.startsWith("/api/user") ||
    path.startsWith("/api/feedback") ||
    path.startsWith("/api/credits/checkout");

  if (isProtectedPage || isProtectedApi) {
    if (isAuthed) {
      return NextResponse.next();
    }
    if (isProtectedApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Redirect to the app's own login page (not the course dashboard)
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/upload/:path*",
    "/admin/:path*",
    "/login",
    "/auth/:path*",
    "/api/process-syllabus",
    "/api/admin/:path*",
    "/api/user/:path*",
    "/api/feedback",
    "/api/credits/:path*",
  ],
};
