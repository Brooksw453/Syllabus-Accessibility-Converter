import { isAdmin } from "./admin";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 5;

// ---------------------------------------------------------------------------
// Vercel KV (persistent) — used when KV_REST_API_URL is configured
// ---------------------------------------------------------------------------

async function getKv() {
  if (!process.env.KV_REST_API_URL) return null;
  try {
    const { kv } = await import("@vercel/kv");
    return kv;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback — used for local dev or when KV is unavailable
// ---------------------------------------------------------------------------

const memUsage = new Map<string, number[]>();
const memLog: { email: string; fileName: string; timestamp: string }[] = [];

function memCheck(email: string): {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
} {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const timestamps = (memUsage.get(email) ?? []).filter((t) => t > cutoff);
  memUsage.set(email, timestamps);

  return {
    allowed: timestamps.length < MAX_PER_WINDOW,
    remaining: Math.max(0, MAX_PER_WINDOW - timestamps.length),
    resetInSeconds:
      timestamps.length > 0
        ? Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000)
        : 0,
  };
}

function memRecord(email: string, fileName: string): void {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const timestamps = (memUsage.get(email) ?? []).filter((t) => t > cutoff);
  timestamps.push(now);
  memUsage.set(email, timestamps);

  memLog.unshift({ email, fileName, timestamp: new Date().toISOString() });
  if (memLog.length > 1000) memLog.length = 1000;
}

function memGetLog(): { email: string; fileName: string; timestamp: string }[] {
  return memLog.slice(0, 1000);
}

// ---------------------------------------------------------------------------
// Public API (async, works with both KV and in-memory)
// ---------------------------------------------------------------------------

export async function checkRateLimit(email: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}> {
  if (isAdmin(email)) {
    return { allowed: true, remaining: 999, resetInSeconds: 0 };
  }

  const kv = await getKv();
  if (!kv) return memCheck(email);

  const hourBucket = Math.floor(Date.now() / WINDOW_MS);
  const key = `ratelimit:${email}:${hourBucket}`;
  const count = (await kv.get<number>(key)) ?? 0;

  return {
    allowed: count < MAX_PER_WINDOW,
    remaining: Math.max(0, MAX_PER_WINDOW - count),
    resetInSeconds: Math.ceil(
      ((hourBucket + 1) * WINDOW_MS - Date.now()) / 1000
    ),
  };
}

export async function recordUsage(
  email: string,
  fileName: string
): Promise<void> {
  const kv = await getKv();

  if (!kv) {
    memRecord(email, fileName);
    return;
  }

  const hourBucket = Math.floor(Date.now() / WINDOW_MS);
  const key = `ratelimit:${email}:${hourBucket}`;

  await kv.incr(key);
  await kv.expire(key, 3600);

  const event = JSON.stringify({
    email,
    fileName,
    timestamp: new Date().toISOString(),
  });
  await kv.lpush("usage:log", event);
  await kv.ltrim("usage:log", 0, 999);
}

export async function getUsageLog(): Promise<
  { email: string; fileName: string; timestamp: string }[]
> {
  const kv = await getKv();

  if (!kv) return memGetLog();

  const raw = await kv.lrange<string>("usage:log", 0, 999);
  return raw.map((entry) => {
    if (typeof entry === "string") return JSON.parse(entry);
    return entry;
  });
}
