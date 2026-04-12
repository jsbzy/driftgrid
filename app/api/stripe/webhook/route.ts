import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Stripe webhook handler — syncs subscription state into profiles table.
 *
 * Stripe → Supabase field mapping:
 *   checkout.session.completed  → tier=pro, status=active, stripe_customer_id, stripe_subscription_id
 *   subscription.updated        → status (active / past_due / canceled), subscription_period_end
 *   subscription.deleted        → tier=free, status=canceled
 *
 * Requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET env vars.
 */
export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' });

  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: import('stripe').Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.client_reference_id || session.metadata?.userId;
      if (userId) {
        await supabase.from('profiles').update({
          tier: 'pro',
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_status: 'active',
        }).eq('id', userId);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const status = subscription.status;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawEnd = (subscription as any).current_period_end;
      const periodEnd = rawEnd ? new Date(rawEnd * 1000).toISOString() : null;

      await supabase.from('profiles').update({
        subscription_status: status,
        subscription_period_end: periodEnd,
        // Keep tier as 'pro' while subscription is active or past_due. Only
        // downgrade to 'free' on deletion (see below).
        ...(status === 'active' || status === 'past_due' ? { tier: 'pro' } : {}),
      }).eq('stripe_subscription_id', subscription.id);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      await supabase.from('profiles').update({
        tier: 'free',
        subscription_status: 'canceled',
        stripe_subscription_id: null,
        subscription_period_end: null,
      }).eq('stripe_subscription_id', subscription.id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
