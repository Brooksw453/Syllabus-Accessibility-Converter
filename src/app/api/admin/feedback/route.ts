import { NextRequest, NextResponse } from "next/server";
import { getEmailCookieName } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getFeedbackLog } from "@/lib/feedback";

export async function GET(request: NextRequest) {
  const authCookie = request.cookies.get("docally-auth");
  if (authCookie?.value !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = request.cookies.get(getEmailCookieName())?.value ?? "";
  if (!isAdmin(email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const feedback = await getFeedbackLog();
  return NextResponse.json({ feedback });
}
