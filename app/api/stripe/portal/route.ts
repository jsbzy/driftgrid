import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getUserId } from '@/lib/auth';
import { getProfile } from '@/lib/subscription';

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 3,
    timeout: 20000,
  });

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const profile = await getProfile(userId);
  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 400 });
  }

  const { origin } = new URL(request.url);
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/`,
  });

  return NextResponse.json({ url: session.url });
}
