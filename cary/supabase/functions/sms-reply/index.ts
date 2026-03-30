/**
 * Cary — SMS Reply (Admin)
 *
 * Sends an outbound SMS from the toll-free number and logs it.
 *
 * POST body: { to, body, admin_token }
 *
 * Required Supabase secrets:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *   APPS_SCRIPT_URL (Google Apps Script backend for admin-verify)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function verifyAdmin(token: string): Promise<boolean> {
  const apiUrl = Deno.env.get('APPS_SCRIPT_URL')
  if (!apiUrl || !token) return false
  try {
    const res = await fetch(`${apiUrl}?action=admin-verify&t=${encodeURIComponent(token)}`)
    const data = await res.json()
    return data?.data?.valid === true
  } catch { return false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload
  try { payload = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { to, body, admin_token } = payload
  if (!to || !body?.trim()) return json({ error: 'Missing to or body' }, 400)

  // Admin auth — verify token against Apps Script backend
  if (!await verifyAdmin(admin_token)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // Send via Twilio
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER')!

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(twilioSid + ':' + twilioAuth)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: twilioFrom, Body: body.trim() }),
    }
  )

  let twilioSidOut = null
  try {
    const data = await res.json()
    twilioSidOut = data.sid || null
    if (!res.ok) {
      console.error('[sms-reply] Twilio error:', JSON.stringify(data))
      return json({ error: 'Twilio send failed' }, 502)
    }
  } catch (err) {
    console.error('[sms-reply] Twilio parse error:', err.message)
    return json({ error: 'Twilio send failed' }, 502)
  }

  // Log outbound message
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    await sb.from('sms_messages').insert({
      phone: to,
      direction: 'outbound',
      body: body.trim(),
      twilio_sid: twilioSidOut,
    })
  } catch (err) {
    console.error('[sms-reply] DB log failed:', err.message)
  }

  return json({ sent: true })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
