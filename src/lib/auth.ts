import { cookies } from "next/headers";

const AUTH_COOKIE_NAME = "syllabus-auth";
const AUTH_TOKEN_VALUE = "authenticated";

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value === AUTH_TOKEN_VALUE;
}

export function getAuthCookieName(): string {
  return AUTH_COOKIE_NAME;
}

export function getAuthTokenValue(): string {
  return AUTH_TOKEN_VALUE;
}
