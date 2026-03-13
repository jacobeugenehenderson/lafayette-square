/**
 * Cary — Complete Session Edge Function
 *
 * Called when a Courier taps "Complete". Finalizes the meter,
 * computes the fare breakdown, and initiates payment via Stripe.
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

Deno.serve(async (req) => {
  const { session_id } = await req.json();

  // Fetch session + request + courier + requester payment method
  const { data: session } = await supabase
    .from('sessions')
    .select('*, requests(*)')
    .eq('id', session_id)
    .single();

  if (!session || session.completed_at) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 400 });
  }

  // Finalize distance from route points
  const { totalMeters } = accumulateDistance(session.route_points || []);
  const now = new Date();
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

  // Charge via Stripe Connect
  const paymentIntent = await stripe.paymentIntents.create({
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
  });

  // Update session with final values
  await supabase
    .from('sessions')
    .update({
      completed_at: now.toISOString(),
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
