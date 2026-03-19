import { NextRequest, NextResponse } from "next/server";
import { getAuthCookieName, getAuthTokenValue } from "@/lib/auth";

const PILOT_CREDITS = 20;
const PILOT_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  const sharedPassword = process.env.SHARED_APP_PASSWORD;
  const pilotCode = process.env.PILOT_ACCESS_CODE;

  if (!sharedPassword) {
    return NextResponse.json(
      { error: "Server configuration error: password not set." },
      { status: 500 }
    );
  }

  const isSecure = process.env.NODE_ENV === "production";

  const clearOptions = { secure: isSecure, sameSite: "strict" as const, path: "/", maxAge: 0 };

  // Pilot access code — 20 conversions, 7-day expiry
  if (pilotCode && password === pilotCode) {
    const response = NextResponse.json({ success: true, mode: "pilot" });
    const baseOptions = { secure: isSecure, sameSite: "strict" as const, path: "/", maxAge: PILOT_MAX_AGE };
    response.cookies.set("pilot-auth", String(PILOT_CREDITS), { ...baseOptions, httpOnly: true });
    // Non-httpOnly so the upload page can read it for display
    response.cookies.set("pilot-credits", String(PILOT_CREDITS), { ...baseOptions, httpOnly: false });
    // Clear any existing regular / demo auth so there's no overlap
    response.cookies.set(getAuthCookieName(), "", { ...clearOptions, httpOnly: true });
    response.cookies.set("demo-auth", "", { ...clearOptions, httpOnly: true });
    if (email) {
      response.cookies.set("syllabus-user-email", email.trim().toLowerCase(), { ...baseOptions, httpOnly: true });
    }
    const timestamp = new Date().toISOString();
    console.log(`[PILOT-LOGIN] time=${timestamp} | email=${email ?? "unknown"}`);
    return response;
  }

  if (password !== sharedPassword) {
    return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  const cookieOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  };
  response.cookies.set(getAuthCookieName(), getAuthTokenValue(), cookieOptions);
  // Clear any existing pilot auth so there's no overlap
  response.cookies.set("pilot-auth", "", { ...clearOptions, httpOnly: true });
  response.cookies.set("pilot-credits", "", { ...clearOptions, httpOnly: false });
  response.cookies.set("demo-auth", "", { ...clearOptions, httpOnly: true });
  if (email) {
    response.cookies.set("syllabus-user-email", email.trim().toLowerCase(), cookieOptions);
  }

  return response;
}
