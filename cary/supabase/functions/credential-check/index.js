/**
 * Cary — Daily Credential Expiry Check
 *
 * Intended to run on a schedule (pg_cron or external cron hitting this endpoint).
 *
 * 1. Sends reminder notifications 30 days before any credential expires
 * 2. Auto-suspends couriers with expired credentials
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

Deno.serve(async (req) => {
  // Verify this is an authorized cron call
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // 1. Auto-suspend expired couriers
  const { data: suspendedCount } = await supabase.rpc('suspend_expired_couriers');

  // 2. Find couriers with credentials expiring within 30 days
  const { data: expiring } = await supabase
    .from('courier_credential_status')
    .select('*')
    .eq('credential_health', 'expiring_soon');

  // 3. Send reminders (Twilio SMS)
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER');
  let remindersSent = 0;

  if (twilioSid && twilioAuth && twilioFrom && expiring?.length) {
    for (const courier of expiring) {
      if (!courier.phone) continue;

      // Determine which credential is expiring soonest
      const expirations = [
        { name: 'driver license', date: courier.drivers_license_expiry },
        { name: 'insurance', date: courier.insurance_expiry },
        { name: 'vehicle registration', date: courier.registration_expiry },
        { name: 'background check', date: courier.background_check_expiry },
      ]
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      const soonest = expirations[0];
      if (!soonest) continue;

      const daysLeft = Math.ceil(
        (new Date(soonest.date) - new Date()) / (1000 * 60 * 60 * 24)
      );

      const message =
        `Cary: Your ${soonest.name} expires in ${daysLeft} days (${soonest.date}). ` +
        `Please renew to keep your courier status active.`;

      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(twilioSid + ':' + twilioAuth)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: courier.phone,
            From: twilioFrom,
            Body: message,
          }),
        }
      );

      remindersSent++;
    }
  }

  return json({
    suspended: suspendedCount ?? 0,
    reminders_sent: remindersSent,
    expiring_couriers: expiring?.length ?? 0,
  });
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
