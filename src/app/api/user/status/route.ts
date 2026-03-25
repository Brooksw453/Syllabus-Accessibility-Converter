import { NextRequest, NextResponse } from "next/server";
import { getEmailCookieName } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const authCookie = request.cookies.get("docally-auth");
  if (authCookie?.value !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = request.cookies.get(getEmailCookieName())?.value ?? "";
  const admin = isAdmin(email);
  const { remaining, resetInSeconds } = await checkRateLimit(email);

  return NextResponse.json({
    email,
    admin,
    remaining: admin ? null : remaining,
    resetInSeconds: admin ? null : resetInSeconds,
  });
}
