import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get("docally-auth");
  const isAuthed = authCookie?.value === "authenticated";

  const path = request.nextUrl.pathname;
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
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/upload/:path*",
    "/admin/:path*",
    "/api/process-syllabus",
    "/api/admin/:path*",
    "/api/user/:path*",
  ],
};
