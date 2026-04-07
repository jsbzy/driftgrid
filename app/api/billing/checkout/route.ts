import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getStripe, PLANS, type PlanName } from '@/lib/stripe';

/**
 * POST /api/billing/checkout
 * Create a Stripe Checkout session for upgrading.
 * Returns a checkout URL to redirect the user to.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 501 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Cloud mode not configured' }, { status: 501 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { workspaceId, plan, seatCount } = await request.json();

  if (!workspaceId || !plan) {
    return NextResponse.json({ error: 'workspaceId and plan required' }, { status: 400 });
  }

  const planConfig = PLANS[plan as PlanName];
  if (!planConfig || !planConfig.stripePriceId) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Get or create Stripe customer
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('stripe_customer_id, name')
    .eq('id', workspaceId)
    .single();

  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  let customerId = workspace.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: workspace.name,
      metadata: {
        workspaceId,
        userId: user.id,
      },
    });
    customerId = customer.id;

    await supabase
      .from('workspaces')
      .update({ stripe_customer_id: customerId })
      .eq('id', workspaceId);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  // Build line items
  const lineItems: any[] = [{
    price: planConfig.stripePriceId,
    quantity: plan === 'team' ? (seatCount || 3) : 1,
  }];

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: lineItems,
    success_url: `${baseUrl}/?upgraded=true`,
    cancel_url: `${baseUrl}/?upgrade=cancelled`,
    metadata: {
      workspaceId,
      plan,
    },
    subscription_data: {
      metadata: {
        workspaceId,
        plan,
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
