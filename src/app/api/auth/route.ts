import { NextRequest, NextResponse } from "next/server";
import { getAuthCookieName, getAuthTokenValue } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  const sharedPassword = process.env.SHARED_APP_PASSWORD;

  if (!sharedPassword) {
    return NextResponse.json(
      { error: "Server configuration error: password not set." },
      { status: 500 }
    );
  }

  if (password !== sharedPassword) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  };
  response.cookies.set(getAuthCookieName(), getAuthTokenValue(), cookieOptions);
  // Store email separately so API routes can log it
  if (email) {
    response.cookies.set("syllabus-user-email", email.trim().toLowerCase(), cookieOptions);
  }

  return response;
}
