// ---------------------------------------------------------------------------
// Purchased credits storage (KV persistent, in-memory fallback)
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
// In-memory fallback — local dev
// ---------------------------------------------------------------------------

const memCredits = new Map<string, number>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getCredits(email: string): Promise<number> {
  const kv = await getKv();
  if (!kv) return memCredits.get(email) ?? 0;
  return (await kv.get<number>(`credits:${email}`)) ?? 0;
}

export async function addCredits(
  email: string,
  amount: number
): Promise<void> {
  const kv = await getKv();
  if (!kv) {
    memCredits.set(email, (memCredits.get(email) ?? 0) + amount);
    return;
  }
  await kv.incrby(`credits:${email}`, amount);
}

export async function deductCredit(email: string): Promise<boolean> {
  const kv = await getKv();

  if (!kv) {
    const current = memCredits.get(email) ?? 0;
    if (current <= 0) return false;
    memCredits.set(email, current - 1);
    return true;
  }

  // Atomic check-and-decrement: read first, decrement if positive
  const current = (await kv.get<number>(`credits:${email}`)) ?? 0;
  if (current <= 0) return false;
  await kv.decrby(`credits:${email}`, 1);
  return true;
}
