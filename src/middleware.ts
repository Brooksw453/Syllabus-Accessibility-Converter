import { NextRequest, NextResponse } from "next/server";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://courses.esdesigns.org";
const COURSE_SLUG = process.env.COURSE_SLUG || "syllabus-accessibility-converter";

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get("docally-auth");
  const isAuthed = authCookie?.value === "authenticated";

  const path = request.nextUrl.pathname;

  // SSO endpoint is always public
  if (path.startsWith("/auth")) {
    return NextResponse.next();
  }

  const isProtectedPage = path.startsWith("/upload") || path.startsWith("/admin");
  const isProtectedApi =
    path.startsWith("/api/process-syllabus") ||
    path.startsWith("/api/admin") ||
    path.startsWith("/api/user");

  if (isProtectedPage || isProtectedApi) {
    if (isAuthed) {
      return NextResponse.next();
    }
    if (isProtectedApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Redirect to dashboard course page for enrollment/login
    return NextResponse.redirect(`${DASHBOARD_URL}/courses/${COURSE_SLUG}`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/upload/:path*",
    "/admin/:path*",
    "/auth/:path*",
    "/api/process-syllabus",
    "/api/admin/:path*",
    "/api/user/:path*",
  ],
};
