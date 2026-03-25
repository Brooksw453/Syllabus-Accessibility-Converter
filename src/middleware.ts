import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get("docally-auth");
  const isAuthed = authCookie?.value === "authenticated";

  const isUploadPage = request.nextUrl.pathname.startsWith("/upload");
  const isAdminPage = request.nextUrl.pathname.startsWith("/admin");
  const isProcessApi = request.nextUrl.pathname.startsWith("/api/process-syllabus");
  const isAdminApi = request.nextUrl.pathname.startsWith("/api/admin");

  if (isUploadPage || isAdminPage || isProcessApi || isAdminApi) {
    if (isAuthed) {
      return NextResponse.next();
    }
    if (isProcessApi || isAdminApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/upload/:path*", "/admin/:path*", "/api/process-syllabus", "/api/admin/:path*"],
};
