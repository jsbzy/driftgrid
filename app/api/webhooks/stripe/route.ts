import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getPlanLimits } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase/client';

/**
 * POST /api/webhooks/stripe
 * Handle Stripe subscription lifecycle events.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();

  if (!stripe || !supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 501 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const workspaceId = session.metadata?.workspaceId;
      const plan = session.metadata?.plan;

      if (workspaceId && plan) {
        const limits = getPlanLimits(plan);
        await supabase.from('workspaces').update({
          plan,
          stripe_subscription_id: session.subscription as string,
          review_link_limit: limits.reviewLinkLimit,
          designer_seat_limit: limits.designerSeatLimit,
          storage_limit_bytes: limits.storageLimitBytes,
        }).eq('id', workspaceId);

        console.log(`Workspace ${workspaceId} upgraded to ${plan}`);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const workspaceId = subscription.metadata?.workspaceId;
      const plan = subscription.metadata?.plan;

      if (workspaceId && plan) {
        const limits = getPlanLimits(plan);
        await supabase.from('workspaces').update({
          plan,
          review_link_limit: limits.reviewLinkLimit,
          designer_seat_limit: limits.designerSeatLimit,
          storage_limit_bytes: limits.storageLimitBytes,
        }).eq('id', workspaceId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const workspaceId = subscription.metadata?.workspaceId;

      if (workspaceId) {
        const freeLimits = getPlanLimits('free');
        await supabase.from('workspaces').update({
          plan: 'free',
          stripe_subscription_id: null,
          review_link_limit: freeLimits.reviewLinkLimit,
          designer_seat_limit: freeLimits.designerSeatLimit,
          storage_limit_bytes: freeLimits.storageLimitBytes,
        }).eq('id', workspaceId);

        console.log(`Workspace ${workspaceId} downgraded to free`);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.warn(`Payment failed for customer ${invoice.customer}.`);
      // Could add grace period logic here
      break;
    }

    default:
      // Unhandled event type — log and ignore
      break;
  }

  return NextResponse.json({ received: true });
}
