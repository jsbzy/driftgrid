import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for upgrading from Free to Pro.
 * Requires authenticated user. Accepts { interval: 'month' | 'year' }
 * to select monthly ($10) or annual ($96/yr = $8/mo effective).
 *
 * Returns { url } pointing to Stripe Checkout.
 */
export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { interval = 'month' } = await request.json().catch(() => ({}));

  // Pick the right price by interval.
  const priceId = interval === 'year'
    ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL
    : process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;

  if (!priceId) {
    return NextResponse.json({ error: 'Price not configured' }, { status: 500 });
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' });

  // Reuse or create a Stripe customer for this user.
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await supabase.from('profiles').update({
      stripe_customer_id: customerId,
    }).eq('id', user.id);
  }

  const origin = request.nextUrl.origin;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: user.id,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/account?upgraded=1`,
    cancel_url: `${origin}/pricing`,
    metadata: { userId: user.id },
  });

  return NextResponse.json({ url: session.url });
}
