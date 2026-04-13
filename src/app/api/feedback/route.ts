import { NextRequest, NextResponse } from "next/server";
import { getEmailCookieName } from "@/lib/auth";
import { submitFeedback } from "@/lib/feedback";

export async function POST(request: NextRequest) {
  const authCookie = request.cookies.get("docally-auth");
  if (authCookie?.value !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email =
    request.cookies.get(getEmailCookieName())?.value ?? "unknown";

  let body: { rating: number; comment: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { rating, comment } = body;

  if (typeof rating !== "number" || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json(
      { error: "Rating must be an integer from 1 to 5" },
      { status: 400 }
    );
  }

  const trimmed = typeof comment === "string" ? comment.trim().slice(0, 1000) : "";

  await submitFeedback(email, rating, trimmed);

  return NextResponse.json({ ok: true });
}
