import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get("syllabus-auth");
  const demoCookie = request.cookies.get("demo-auth");
  const pilotCredits = parseInt(request.cookies.get("pilot-auth")?.value ?? "0", 10);

  const isFullyAuthed = authCookie?.value === "authenticated";
  const isDemoAvailable = demoCookie?.value === "available";
  const isDemoUsed = demoCookie?.value === "used";
  const isPilot = !isNaN(pilotCredits) && pilotCredits > 0;

  const isUploadPage = request.nextUrl.pathname.startsWith("/upload");
  const isProcessApi = request.nextUrl.pathname.startsWith("/api/process-syllabus");

  if (isUploadPage || isProcessApi) {
    if (isFullyAuthed || isDemoAvailable || isPilot) {
      return NextResponse.next();
    }
    if (isDemoUsed && isUploadPage) {
      return NextResponse.redirect(new URL("/?trial=used", request.url));
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
