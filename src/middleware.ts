import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get("docally-auth");
  const isAuthed = authCookie?.value === "authenticated";

  const isUploadPage = request.nextUrl.pathname.startsWith("/upload");
  const isProcessApi = request.nextUrl.pathname.startsWith("/api/process-syllabus");

  if (isUploadPage || isProcessApi) {
    if (isAuthed) {
      return NextResponse.next();
    }
    if (isProcessApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/upload/:path*", "/api/process-syllabus"],
};
