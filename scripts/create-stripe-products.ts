/**
 * One-time script to create Stripe products and prices for Document Ally credits.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_... npx tsx scripts/create-stripe-products.ts
 *
 * Outputs price IDs to set as environment variables.
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY env var before running this script.");
  process.exit(1);
}

const stripe = new Stripe(key);

const TIERS = [
  { credits: 20, amount: 499, name: "Starter" },
  { credits: 50, amount: 999, name: "Popular" },
  { credits: 100, amount: 1499, name: "Best Value" },
] as const;

async function main() {
  // Create product
  const product = await stripe.products.create({
    name: "Document Ally Credits",
    description:
      "Purchased conversion credits for Document Ally. Credits never expire.",
  });
  console.log(`Product created: ${product.id}\n`);

  // Create prices
  for (const tier of TIERS) {
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: tier.amount,
      currency: "usd",
      metadata: { credits: String(tier.credits) },
      nickname: `${tier.name} — ${tier.credits} credits`,
    });
    console.log(
      `${tier.name} (${tier.credits} credits, $${(tier.amount / 100).toFixed(2)}): ${price.id}`
    );
  }

  console.log("\nAdd these price IDs to your environment variables:");
  console.log("  STRIPE_PRICE_20=<first price id>");
  console.log("  STRIPE_PRICE_50=<second price id>");
  console.log("  STRIPE_PRICE_100=<third price id>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
