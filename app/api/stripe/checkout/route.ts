import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
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
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated — please log in first' }, { status: 401 });
    }

    const { interval = 'month' } = await request.json().catch(() => ({}));

    // Pick the right price by interval. Trim whitespace defensively — env vars
    // pasted into Vercel sometimes carry a trailing newline that Stripe rejects
    // with "No such price: 'price_xxx\n'".
    const priceId = (interval === 'year'
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_ID)?.trim();

    if (!priceId) {
      return NextResponse.json({
        error: `Price not configured for ${interval}. Missing env var ${interval === 'year' ? 'NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL' : 'NEXT_PUBLIC_STRIPE_PRICE_ID'}.`
      }, { status: 500 });
    }

    // Use the fetch-based client on Vercel serverless — createNodeHttpClient()
    // intermittently throws "connection to Stripe" errors on Node 20+ runtimes.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 3,
      timeout: 20000,
    });

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
  } catch (err) {
    console.error('Checkout error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    const details = err instanceof Error ? err.constructor.name : typeof err;
    return NextResponse.json({
      error: message,
      type: details,
      keyPresent: !!process.env.STRIPE_SECRET_KEY,
      keyPrefix: process.env.STRIPE_SECRET_KEY?.substring(0, 8),
    }, { status: 500 });
  }
}
