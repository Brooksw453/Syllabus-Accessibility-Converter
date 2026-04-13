export interface FeedbackEntry {
  email: string;
  rating: number;
  comment: string;
  timestamp: string;
}

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

const memFeedback: FeedbackEntry[] = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function submitFeedback(
  email: string,
  rating: number,
  comment: string
): Promise<void> {
  const entry: FeedbackEntry = {
    email,
    rating,
    comment,
    timestamp: new Date().toISOString(),
  };

  const kv = await getKv();

  if (!kv) {
    memFeedback.unshift(entry);
    if (memFeedback.length > 1000) memFeedback.length = 1000;
    return;
  }

  await kv.lpush("feedback:log", JSON.stringify(entry));
  await kv.ltrim("feedback:log", 0, 999);
}

export async function getFeedbackLog(): Promise<FeedbackEntry[]> {
  const kv = await getKv();

  if (!kv) return memFeedback.slice(0, 1000);

  const raw = await kv.lrange<string>("feedback:log", 0, 999);
  return raw.map((entry) => {
    if (typeof entry === "string") return JSON.parse(entry);
    return entry;
  });
}
