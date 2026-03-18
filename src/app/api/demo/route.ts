import { NextResponse } from "next/server";

export async function POST() {
  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ redirect: "/upload?demo=1" });
  response.cookies.set("demo-auth", "available", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 2, // 2 hours
  });
  return response;
}
