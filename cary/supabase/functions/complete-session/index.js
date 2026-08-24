/**
 * Cary — Complete Session Edge Function
 *
 * Called when a Courier taps "Complete". Finalizes the meter,
 * computes the fare breakdown, and initiates payment via Stripe.
 *
 * ⛔ AUTH: requires the COURIER'S OWN Supabase user JWT
 * (`Authorization: Bearer <access token>`), and the caller must be the courier
 * on the session being completed. This endpoint MOVES MONEY — it charges the
 * requester's card and transfers to the courier's Connect account — so it is
 * the function's own job to authorize it. It runs on a service-role client that
 * bypasses RLS, and `verify_jwt` is no help (the public anon key is a valid
 * JWT). See SECURITY.md F-3.
 *
 * ⚠️ THIS FUNCTION HAS NEVER BEEN DEPLOYED, deliberately, and it will not run
 * as written: the `@supabase/supabase-js` and `stripe` imports below are bare
 * specifiers that Deno cannot resolve without an import map (every deployed
 * sibling uses an `https://esm.sh/...` URL). That is left alone on purpose —
 * making a money-moving endpoint deployable is not a change to smuggle into a
 * security fix. ⛔ `supabase functions deploy` with NO NAME would ship this.
 */

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { computeFare, computeBreakdown } from '../../lib/meter.js';
import { accumulateDistance } from '../../lib/geo.js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

/** Resolve the caller to a user id from their verified Supabase JWT. */
async function callerId(req) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const caller = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await caller.auth.getUser();
  return error ? null : data?.user?.id ?? null;
}

Deno.serve(async (req) => {
  const uid = await callerId(req);
  if (!uid) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
  }

  const { session_id } = await req.json();

  // Fetch session + request + courier + requester payment method
  const { data: session } = await supabase
    .from('sessions')
    .select('*, requests(*)')
    .eq('id', session_id)
    .single();

  if (!session) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 400 });
  }

  // ── F-3 · Only the session's own courier may complete it ──────
  // ⛔ Derived from the session row, never from the request body.
  if (session.courier_id !== uid) {
    console.warn(`[complete-session] ${uid} tried to complete session ${session_id} owned by ${session.courier_id}`);
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const now = new Date();

  // ── F-3 · Claim the session ATOMICALLY before charging ────────
  // The old guard read `completed_at` and then acted on it. Two concurrent
  // POSTs both read null and both create a PaymentIntent — the requester is
  // charged twice. This conditional UPDATE is the claim: exactly one caller
  // gets a row back, and a replay gets zero and is turned away without
  // touching Stripe.
  const { data: claimed } = await supabase
    .from('sessions')
    .update({ completed_at: now.toISOString() })
    .eq('id', session_id)
    .is('completed_at', null)
    .select('id');

  if (!claimed?.length) {
    return new Response(JSON.stringify({ error: 'Session already completed' }), { status: 409 });
  }

  // Finalize distance from route points
  const { totalMeters } = accumulateDistance(session.route_points || []);
  const durationSeconds = Math.round((now - new Date(session.started_at)) / 1000);

  // Fetch fare config for this courier's vehicle type
  const { data: courier } = await supabase
    .from('courier_profiles')
    .select('vehicle_type, stripe_connect_account_id')
    .eq('id', session.courier_id)
    .single();

  const { data: fareConfig } = await supabase
    .from('fare_config')
    .select('*')
    .eq('vehicle_type', courier.vehicle_type)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single();

  // Compute fare and breakdown
  const fareCents = computeFare(totalMeters, durationSeconds, fareConfig);
  const breakdown = computeBreakdown(fareCents);

  // Get requester's payment method
  const { data: paymentMethod } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('profile_id', session.requests.requester_id)
    .eq('is_default', true)
    .single();

  // ⛔ No card, no silent success. Mark the claim failed so the session is not
  // left looking completed-and-paid, and say so.
  if (!paymentMethod?.stripe_customer_id) {
    await supabase
      .from('sessions')
      .update({ payment_status: 'failed' })
      .eq('id', session_id);
    return new Response(
      JSON.stringify({ error: 'No default payment method on file for the requester' }),
      { status: 402 }
    );
  }

  // Charge via Stripe Connect.
  // ⛔ A throw here would leave the session claimed-as-completed with
  // payment_status still at its 'pending' default — indistinguishable from a
  // charge that is merely in flight. Record the failure explicitly.
  // `idempotencyKey` is belt-and-braces behind the atomic claim: if this
  // function is ever retried at the network layer, Stripe collapses the retry
  // rather than charging twice.
  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: breakdown.requester_total,
        currency: 'usd',
        customer: paymentMethod.stripe_customer_id,
        payment_method: paymentMethod.stripe_payment_method,
        confirm: true,
        application_fee_amount: breakdown.platform_fee + breakdown.processing_fee,
        transfer_data: {
          destination: courier.stripe_connect_account_id,
        },
        metadata: {
          session_id: session.id,
          fare: breakdown.fare,
          platform_fee: breakdown.platform_fee,
          processing_fee: breakdown.processing_fee,
        },
      },
      { idempotencyKey: `cary-session-${session.id}` }
    );
  } catch (err) {
    console.error(`[complete-session] charge failed for session ${session.id}:`, err.message);
    await supabase
      .from('sessions')
      .update({ payment_status: 'failed' })
      .eq('id', session_id);
    return new Response(
      JSON.stringify({ error: 'Payment failed', detail: err.message }),
      { status: 402 }
    );
  }

  // Update session with final values
  await supabase
    .from('sessions')
    .update({
      // completed_at was set by the atomic claim above.
      distance_meters: totalMeters,
      duration_seconds: durationSeconds,
      fare_cents: breakdown.fare,
      platform_fee_cents: breakdown.platform_fee,
      processing_fee_cents: breakdown.processing_fee,
      courier_payout_cents: breakdown.courier_payout,
      payment_status: paymentIntent.status === 'succeeded' ? 'captured' : 'pending',
      stripe_payment_intent_id: paymentIntent.id,
    })
    .eq('id', session_id);

  // Update request status
  await supabase
    .from('requests')
    .update({ status: 'completed' })
    .eq('id', session.request_id);

  return new Response(JSON.stringify({
    fare: breakdown.fare,
    platform_fee: breakdown.platform_fee,
    processing_fee: breakdown.processing_fee,
    requester_total: breakdown.requester_total,
    courier_payout: breakdown.courier_payout,
    payment_status: paymentIntent.status,
  }));
});
