/**
 * Cary — Stripe & Checkr Webhook Handlers
 *
 * Processes incoming webhooks from:
 * - Stripe Connect (account updates, payment events)
 * - Stripe Identity (verification results)
 * - Checkr (background check results)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

/**
 * Handle Checkr background check completion.
 * Updates verification_checks and tries to activate the courier.
 */
export async function handleCheckrWebhook(event) {
  const { type, data } = event;

  if (type === 'report.completed') {
    const status = data.result === 'clear' ? 'passed' : 'failed';
    const expiresAt = status === 'passed'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
      : null;

    // Update verification check
    const { data: checks } = await supabase
      .from('verification_checks')
      .update({ status, expires_at: expiresAt })
      .eq('vendor', 'checkr')
      .eq('vendor_reference_id', data.candidate_id)
      .select('courier_id');

    if (!checks?.length) return;
    const courierId = checks[0].courier_id;

    // Update background check expiry on courier profile
    if (status === 'passed') {
      await supabase
        .from('courier_profiles')
        .update({ background_check_expiry: expiresAt.split('T')[0] })
        .eq('id', courierId);

      // Also mark driver license as verified (Checkr MVR covers this)
      await supabase
        .from('verification_checks')
        .update({ status: 'passed' })
        .eq('courier_id', courierId)
        .eq('type', 'driver_license')
        .eq('status', 'pending');

      await supabase
        .from('courier_profiles')
        .update({ drivers_license_verified: true })
        .eq('id', courierId);
    }

    // Try activation via DB function
    await supabase.rpc('try_activate_courier', { p_courier_id: courierId });
  }
}

/**
 * Handle Stripe Identity verification session results.
 * Fires when identity verification completes or fails.
 */
export async function handleStripeIdentityWebhook(event) {
  const session = event.data.object;
  const courierId = session.metadata?.courier_id;
  if (!courierId) return;

  const statusMap = {
    'identity.verification_session.verified': 'passed',
    'identity.verification_session.requires_input': 'failed',
  };

  const status = statusMap[event.type];
  if (!status) return;

  await supabase
    .from('verification_checks')
    .update({ status })
    .eq('vendor', 'stripe_identity')
    .eq('vendor_reference_id', session.id);

  if (status === 'passed') {
    await supabase.rpc('try_activate_courier', { p_courier_id: courierId });
  }
}

/**
 * Handle Stripe Connect account updates.
 * Fires when a courier completes their Stripe onboarding.
 */
export async function handleStripeAccountUpdate(event) {
  const account = event.data.object;

  if (account.charges_enabled && account.payouts_enabled) {
    // Find the courier with this Connect account
    const { data: couriers } = await supabase
      .from('courier_profiles')
      .update({ stripe_connect_account_id: account.id })
      .eq('stripe_connect_account_id', account.id)
      .select('id');

    if (couriers?.length) {
      await supabase.rpc('try_activate_courier', { p_courier_id: couriers[0].id });
    }
  }
}

/**
 * Handle payment intent events for session payments.
 */
export async function handlePaymentEvent(event) {
  const intent = event.data.object;
  const sessionId = intent.metadata?.session_id;
  if (!sessionId) return;

  const statusMap = {
    'payment_intent.succeeded': 'captured',
    'payment_intent.payment_failed': 'failed',
  };

  const paymentStatus = statusMap[event.type];
  if (paymentStatus) {
    await supabase
      .from('sessions')
      .update({ payment_status: paymentStatus })
      .eq('id', sessionId);
  }
}
