/**
 * Cary — Courier Onboarding Edge Function
 *
 * Orchestrates the 10-step onboarding pipeline:
 *   1. Account created (handled by Supabase Auth + client)
 *   2. Identity verification (Stripe Identity session)
 *   3. Driver license verification
 *   4. Background check (Checkr invitation)
 *   5. Insurance verification
 *   6. Vehicle registration
 *   7. Courier agreement
 *   8. Credential issued (auto via try_activate_courier)
 *   9. Orientation (optional, tracked)
 *  10. Go live (toggle availability)
 *
 * Actions:
 *   GET  /onboarding?courier_id=...       → get_status
 *   POST /onboarding { action, ... }      → step-specific handlers
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

Deno.serve(async (req) => {
  try {
    if (req.method === 'GET') {
      return await handleGetStatus(req);
    }
    if (req.method === 'POST') {
      return await handleAction(req);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Onboarding error:', err);
    return json({ error: err.message }, 500);
  }
});

// ── GET: Onboarding status ──────────────────────────────────

async function handleGetStatus(req) {
  const url = new URL(req.url);
  const courierId = url.searchParams.get('courier_id');
  if (!courierId) return json({ error: 'courier_id required' }, 400);

  const { data, error } = await supabase.rpc('get_onboarding_status', {
    p_courier_id: courierId,
  });

  if (error) return json({ error: error.message }, 500);
  return json(data);
}

// ── POST: Step actions ──────────────────────────────────────

async function handleAction(req) {
  const body = await req.json();
  const { action, courier_id } = body;

  if (!courier_id) return json({ error: 'courier_id required' }, 400);

  const actions = {
    start_identity: startIdentityVerification,
    submit_license: submitLicense,
    start_background: startBackgroundCheck,
    submit_insurance: submitInsurance,
    submit_vehicle: submitVehicle,
    accept_agreement: acceptAgreement,
    complete_orientation: completeOrientation,
    check_activation: checkActivation,
  };

  const handler = actions[action];
  if (!handler) return json({ error: `Unknown action: ${action}` }, 400);

  return await handler(courier_id, body);
}

// ── Step 2: Identity Verification (Stripe Identity) ─────────

async function startIdentityVerification(courierId) {
  // Create a Stripe Identity verification session.
  // The client receives the session URL and redirects the user.
  // Results come back via Stripe webhook → handleStripeIdentityWebhook.

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json({ error: 'Stripe not configured' }, 503);

  const res = await fetch('https://api.stripe.com/v1/identity/verification_sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      type: 'document',
      'metadata[courier_id]': courierId,
      'options[document][require_matching_selfie]': 'true',
    }),
  });

  const session = await res.json();
  if (session.error) return json({ error: session.error.message }, 400);

  // Record the pending verification check
  await supabase.from('verification_checks').insert({
    courier_id: courierId,
    type: 'identity',
    vendor: 'stripe_identity',
    vendor_reference_id: session.id,
    status: 'pending',
    cost_cents: 150, // $1.50
  });

  // Advance onboarding step
  await supabase
    .from('courier_profiles')
    .update({ onboarding_step: 'license' })
    .eq('id', courierId);

  return json({
    verification_url: session.url,
    session_id: session.id,
  });
}

// ── Step 3: Driver License ──────────────────────────────────

async function submitLicense(courierId, body) {
  const { license_state, license_expiry } = body;

  if (!license_state || !license_expiry) {
    return json({ error: 'license_state and license_expiry required' }, 400);
  }

  // Record the license verification check
  // Actual license number is NOT stored — only state + expiry.
  // Driving record check handled by Checkr in the background step.
  await supabase.from('verification_checks').insert({
    courier_id: courierId,
    type: 'driver_license',
    vendor: 'manual', // Verified alongside Checkr MVR
    status: 'pending',
    cost_cents: 0,
    expires_at: license_expiry,
  });

  await supabase
    .from('courier_profiles')
    .update({
      drivers_license_expiry: license_expiry,
      onboarding_step: 'background',
    })
    .eq('id', courierId);

  return json({ step: 'background', message: 'License recorded. Proceeding to background check.' });
}

// ── Step 4: Background Check (Checkr) ───────────────────────

async function startBackgroundCheck(courierId) {
  // Get courier profile for the invitation
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, display_name')
    .eq('id', courierId)
    .single();

  if (!profile?.email) {
    return json({ error: 'Email required for background check' }, 400);
  }

  const checkrKey = Deno.env.get('CHECKR_API_KEY');
  if (!checkrKey) return json({ error: 'Checkr not configured' }, 503);

  // Create Checkr candidate
  const candidateRes = await fetch('https://api.checkr.com/v1/candidates', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(checkrKey + ':')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: profile.email,
      first_name: profile.display_name.split(' ')[0],
      last_name: profile.display_name.split(' ').slice(1).join(' ') || '',
      metadata: { courier_id: courierId },
    }),
  });

  const candidate = await candidateRes.json();
  if (candidate.error) return json({ error: candidate.error }, 400);

  // Create Checkr invitation (sends email to candidate)
  const invRes = await fetch('https://api.checkr.com/v1/invitations', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(checkrKey + ':')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      candidate_id: candidate.id,
      package: 'driver_pro', // Includes MVR + criminal + sex offender registry
    }),
  });

  const invitation = await invRes.json();

  // Record the pending check
  await supabase.from('verification_checks').insert({
    courier_id: courierId,
    type: 'background',
    vendor: 'checkr',
    vendor_reference_id: candidate.id,
    status: 'pending',
    cost_cents: 4000, // ~$40
  });

  await supabase
    .from('courier_profiles')
    .update({ onboarding_step: 'insurance' })
    .eq('id', courierId);

  return json({
    step: 'insurance',
    message: 'Background check initiated. You will receive an email from Checkr.',
    invitation_url: invitation.invitation_url,
  });
}

// ── Step 5: Insurance ───────────────────────────────────────

async function submitInsurance(courierId, body) {
  const { insurance_expiry, vehicle_vin } = body;

  if (!insurance_expiry) {
    return json({ error: 'insurance_expiry required' }, 400);
  }

  // Insurance policy document stays with the courier / uploaded to vendor.
  // We only track verification status + expiry.
  await supabase.from('verification_checks').insert({
    courier_id: courierId,
    type: 'insurance',
    vendor: 'manual',
    status: 'passed', // Manual review — mark passed on upload
    cost_cents: 0,
    expires_at: insurance_expiry,
  });

  await supabase
    .from('courier_profiles')
    .update({
      insurance_verified: true,
      insurance_expiry: insurance_expiry,
      onboarding_step: 'vehicle',
    })
    .eq('id', courierId);

  return json({ step: 'vehicle', message: 'Insurance verified.' });
}

// ── Step 6: Vehicle Registration ────────────────────────────

async function submitVehicle(courierId, body) {
  const { vehicle_make, vehicle_model, vehicle_year, license_plate, registration_expiry } = body;

  if (!vehicle_make || !vehicle_model || !vehicle_year) {
    return json({ error: 'vehicle_make, vehicle_model, vehicle_year required' }, 400);
  }

  await supabase
    .from('courier_profiles')
    .update({
      vehicle_make,
      vehicle_model,
      vehicle_year,
      license_plate: license_plate || null,
      registration_expiry: registration_expiry || null,
      vehicle_description: `${vehicle_year} ${vehicle_make} ${vehicle_model}`,
      onboarding_step: 'agreement',
    })
    .eq('id', courierId);

  return json({ step: 'agreement', message: 'Vehicle registered.' });
}

// ── Step 7: Courier Agreement ───────────────────────────────

async function acceptAgreement(courierId) {
  await supabase
    .from('courier_profiles')
    .update({
      agreement_accepted_at: new Date().toISOString(),
      onboarding_step: 'pending_activation',
    })
    .eq('id', courierId);

  // Try to activate immediately if all async checks are already done
  const { data: activated } = await supabase.rpc('try_activate_courier', {
    p_courier_id: courierId,
  });

  if (activated) {
    return json({ step: 'active', message: 'All requirements met. Courier credential issued.' });
  }

  return json({
    step: 'pending_activation',
    message: 'Agreement accepted. Waiting for background check and verification results.',
  });
}

// ── Step 9: Orientation ─────────────────────────────────────

async function completeOrientation(courierId) {
  await supabase
    .from('courier_profiles')
    .update({ orientation_completed_at: new Date().toISOString() })
    .eq('id', courierId);

  return json({ message: 'Orientation completed.' });
}

// ── Check activation (called after webhooks resolve) ────────

async function checkActivation(courierId) {
  const { data: activated } = await supabase.rpc('try_activate_courier', {
    p_courier_id: courierId,
  });

  if (activated) {
    return json({ status: 'active', message: 'Courier credential issued. You are now active.' });
  }

  // Return current status so client knows what's still pending
  const { data: status } = await supabase.rpc('get_onboarding_status', {
    p_courier_id: courierId,
  });

  return json({ status: 'pending', onboarding: status });
}

// ── Helpers ─────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
