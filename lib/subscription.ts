import { getSupabaseAdmin, isCloudMode } from './supabase';

/** Check if a user has an active subscription. Returns true in local mode (no gating). */
export async function isSubscribed(userId: string | null): Promise<boolean> {
  if (!isCloudMode() || !userId) return true; // local mode = always subscribed

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', userId)
    .single();

  if (error || !data) return false;
  return data.subscription_status === 'active';
}

/** Get the user's profile including subscription info */
export async function getProfile(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}
