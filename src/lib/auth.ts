import { cookies } from "next/headers";

const AUTH_COOKIE_NAME = "syllabus-auth";
const AUTH_TOKEN_VALUE = "authenticated";
const DEMO_COOKIE_NAME = "demo-auth";

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  if (cookieStore.get(AUTH_COOKIE_NAME)?.value === AUTH_TOKEN_VALUE) return true;
  if (cookieStore.get(DEMO_COOKIE_NAME)?.value === "available") return true;
  // Pilot users have credits remaining
  const pilotCredits = parseInt(cookieStore.get("pilot-auth")?.value ?? "0", 10);
  return !isNaN(pilotCredits) && pilotCredits > 0;
}

export function getAuthCookieName(): string {
  return AUTH_COOKIE_NAME;
}

export function getAuthTokenValue(): string {
  return AUTH_TOKEN_VALUE;
}

export function getDemoCookieName(): string {
  return DEMO_COOKIE_NAME;
}
