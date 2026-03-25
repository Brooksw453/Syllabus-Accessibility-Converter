import { NextResponse } from "next/server";

export async function POST() {
  const isSecure = process.env.NODE_ENV === "production";
  const clearOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 0,
  };

  const response = NextResponse.json({ success: true });
  response.cookies.set("docally-auth", "", clearOptions);
  response.cookies.set("docally-user-email", "", clearOptions);
  return response;
}
