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
 * Updates verification_checks and potentially activates the courier.
 */
export async function handleCheckrWebhook(event) {
  const { type, data } = event;

  if (type === 'report.completed') {
    const status = data.result === 'clear' ? 'passed' : 'failed';

    await supabase
      .from('verification_checks')
      .update({ status })
      .eq('vendor', 'checkr')
      .eq('vendor_reference_id', data.id);

    if (status === 'passed') {
      await tryActivateCourier(data.candidate_id);
    }
  }
}

/**
 * Handle Stripe Connect account updates.
 * Fires when a courier completes their Stripe onboarding.
 */
export async function handleStripeAccountUpdate(event) {
  const account = event.data.object;

  if (account.charges_enabled && account.payouts_enabled) {
    await supabase
      .from('courier_profiles')
      .update({ stripe_connect_account_id: account.id })
      .eq('stripe_connect_account_id', account.id);
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

/**
 * Check if all verifications are complete and activate the courier.
 * Called after each verification passes.
 */
async function tryActivateCourier(courierIdOrRef) {
  // Find the courier from the verification check
  const { data: checks } = await supabase
    .from('verification_checks')
    .select('courier_id, type, status')
    .or(`courier_id.eq.${courierIdOrRef},vendor_reference_id.eq.${courierIdOrRef}`);

  if (!checks?.length) return;
  const courierId = checks[0].courier_id;

  // Check if all required verifications have passed
  const required = ['background', 'identity'];
  const passed = checks.filter((c) => c.status === 'passed').map((c) => c.type);
  const allPassed = required.every((r) => passed.includes(r));

  if (allPassed) {
    await supabase
      .from('courier_profiles')
      .update({
        status: 'active',
        activated_at: new Date().toISOString(),
      })
      .eq('id', courierId);
  }
}
