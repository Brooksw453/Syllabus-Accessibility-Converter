import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getAuthCookieName, getAuthTokenValue, getEmailCookieName } from "@/lib/auth";

/**
 * SSO endpoint for Document Ally.
 * Receives a JWT from the Course Dashboard, verifies it,
 * and sets the same auth cookies used by the existing middleware.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const origin = new URL(request.url).origin;

  if (!token) {
    return NextResponse.redirect(`${origin}/?error=missing_token`);
  }

  const ssoSecret = process.env.DASHBOARD_SSO_SECRET;
  if (!ssoSecret) {
    console.error("DASHBOARD_SSO_SECRET is not configured");
    return NextResponse.redirect(`${origin}/?error=sso_not_configured`);
  }

  // Verify the JWT
  let payload: { email: string; full_name: string; role: string };
  try {
    const secret = new TextEncoder().encode(ssoSecret);
    const result = await jwtVerify(token, secret);
    payload = result.payload as typeof payload;
  } catch (err) {
    console.error("SSO token verification failed:", err);
    return NextResponse.redirect(`${origin}/?error=invalid_token`);
  }

  if (!payload.email) {
    return NextResponse.redirect(`${origin}/?error=invalid_payload`);
  }

  // Set the same auth cookies that Document Ally's middleware expects
  const isSecure = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  };

  const response = NextResponse.redirect(`${origin}/upload`);
  response.cookies.set(getAuthCookieName(), getAuthTokenValue(), cookieOptions);
  response.cookies.set(getEmailCookieName(), payload.email.toLowerCase(), cookieOptions);

  console.log(`[SSO LOGIN] time=${new Date().toISOString()} | email=${payload.email}`);
  return response;
}
