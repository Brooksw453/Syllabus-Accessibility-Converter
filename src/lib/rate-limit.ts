const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 10;

const usage = new Map<string, number[]>();

export function checkRateLimit(email: string): {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
} {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const timestamps = (usage.get(email) ?? []).filter((t) => t > cutoff);
  usage.set(email, timestamps);

  const allowed = timestamps.length < MAX_PER_WINDOW;
  const remaining = Math.max(0, MAX_PER_WINDOW - timestamps.length);
  const resetInSeconds =
    timestamps.length > 0
      ? Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000)
      : 0;

  return { allowed, remaining, resetInSeconds };
}

export function recordUsage(email: string): void {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const timestamps = (usage.get(email) ?? []).filter((t) => t > cutoff);
  timestamps.push(now);
  usage.set(email, timestamps);
}
