import { NextRequest, NextResponse } from "next/server";
import { getEmailCookieName } from "@/lib/auth";
import Stripe from "stripe";

const TIERS: Record<string, { priceEnv: string; credits: number }> = {
  starter: { priceEnv: "STRIPE_PRICE_20", credits: 20 },
  popular: { priceEnv: "STRIPE_PRICE_50", credits: 50 },
  value: { priceEnv: "STRIPE_PRICE_100", credits: 100 },
};

export async function POST(request: NextRequest) {
  const authCookie = request.cookies.get("docally-auth");
  if (authCookie?.value !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email =
    request.cookies.get(getEmailCookieName())?.value ?? "unknown";

  let body: { tier: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tier = TIERS[body.tier];
  if (!tier) {
    return NextResponse.json(
      { error: "Invalid tier. Use: starter, popular, or value" },
      { status: 400 }
    );
  }

  const priceId = process.env[tier.priceEnv];
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Payment not configured" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const origin = request.headers.get("origin") ?? "https://accessibility.esdesigns.org";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email,
    metadata: {
      email,
      credits: String(tier.credits),
    },
    success_url: `${origin}/upload?purchased=${tier.credits}`,
    cancel_url: `${origin}/upload`,
  });

  return NextResponse.json({ url: session.url });
}
