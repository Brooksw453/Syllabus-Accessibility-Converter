import { NextResponse } from "next/server";
import { getAuthCookieName, getAuthTokenValue, getEmailCookieName } from "@/lib/auth";

export async function POST(request: Request) {
  let email = "";
  try {
    const body = await request.json();
    email = (body.email ?? "").toString().trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }

  const isSecure = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  };

  const response = NextResponse.json({ success: true });
  response.cookies.set(getAuthCookieName(), getAuthTokenValue(), cookieOptions);
  response.cookies.set(getEmailCookieName(), email, cookieOptions);

  // Clear legacy cookies from previous auth system
  const clearOptions = { secure: isSecure, sameSite: "strict" as const, path: "/", maxAge: 0 };
  response.cookies.set("syllabus-auth", "", { ...clearOptions, httpOnly: true });
  response.cookies.set("demo-auth", "", { ...clearOptions, httpOnly: true });
  response.cookies.set("pilot-auth", "", { ...clearOptions, httpOnly: true });
  response.cookies.set("pilot-credits", "", { ...clearOptions, httpOnly: false });
  response.cookies.set("syllabus-user-email", "", { ...clearOptions, httpOnly: true });

  console.log(`[LOGIN] time=${new Date().toISOString()} | email=${email}`);
  return response;
}
