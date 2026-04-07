import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/**
 * Get the Stripe client instance.
 * Returns null if Stripe is not configured.
 */
export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  _stripe = new Stripe(key, {
    typescript: true,
  });

  return _stripe;
}

/**
 * Plan definitions — maps plan names to limits and Stripe price IDs.
 */
export const PLANS = {
  free: {
    name: 'Free',
    reviewLinkLimit: 1,
    designerSeatLimit: 1,
    storageLimitBytes: 500 * 1024 * 1024, // 500MB
    stripePriceId: null,
  },
  pro: {
    name: 'Pro',
    reviewLinkLimit: -1, // unlimited
    designerSeatLimit: 3,
    storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10GB
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || null,
  },
  team: {
    name: 'Team',
    reviewLinkLimit: -1, // unlimited
    designerSeatLimit: -1, // unlimited (per-seat billing)
    storageLimitBytes: 50 * 1024 * 1024 * 1024, // 50GB
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID || null,
  },
} as const;

export type PlanName = keyof typeof PLANS;

/**
 * Get the limits for a given plan.
 */
export function getPlanLimits(plan: string) {
  return PLANS[plan as PlanName] || PLANS.free;
}
