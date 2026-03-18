import { NextRequest, NextResponse } from "next/server";

const DEMO_TTL = 60 * 60 * 12; // 12 hours

export async function POST(request: NextRequest) {
  let email = "";
  try {
    const body = await request.json();
    email = (body.email ?? "").toString().trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "A valid email address is required to start the free trial." },
      { status: 400 }
    );
  }

  // Check if this browser already used a trial (same-device enforcement)
  const existing = request.cookies.get("demo-auth")?.value;
  if (existing === "used") {
    return NextResponse.json(
      { error: "Your free trial has already been used. Contact bwinchell@esdesigns.org for full access." },
      { status: 403 }
    );
  }

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ redirect: "/upload?demo=1" });
  response.cookies.set("demo-auth", "available", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: DEMO_TTL,
  });
  // Non-httpOnly so the upload page can read it for display
  response.cookies.set("demo-email", email, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: DEMO_TTL,
  });

  console.log(`[DEMO-START] email=${email} | time=${new Date().toISOString()}`);
  return response;
}
