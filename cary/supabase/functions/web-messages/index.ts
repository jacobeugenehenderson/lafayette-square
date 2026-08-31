/**
 * Cary — Web Messages
 *
 * Handles in-app messaging for device-hash-identified users.
 *
 * POST body: { action, device_hash, ... }
 *   action "unread" — count unread admin replies for a device
 *   action "fetch"  — get full thread + mark admin replies as read
 *   action "reply"  — user sends a follow-up message (buzzes admin)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        // ⛔ `x-device-hash` IS NOT OPTIONAL. The browser client sends it on every
  // request — `fetchWithDeviceHash` in src/lib/supabase.js attaches it whenever
  // the device has a hash — and a header missing from this list makes the BROWSER
  // block the call after an otherwise-successful preflight. The function never
  // sees the request and logs nothing; the client reports only 'Failed to send a
  // request to the Edge Function', which is indistinguishable from the service
  // being down.
  // ⚠️ It bites only devices that HAVE a hash, so it reads as working until a
  // browser earns one — and from then on that browser alone is broken, for good.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-hash',
      },
    })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload
  try { payload = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { action, device_hash } = payload
  if (!device_hash) return json({ error: 'Missing device_hash' }, 400)

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── Unread count ──────────────────────────────────────────
  if (action === 'unread') {
    const { count, error } = await sb
      .from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('device_hash', device_hash)
      .eq('direction', 'outbound')
      .is('read_at', null)

    // ⛔ NOT `{ count: 0 }`. "I could not ask" and "nothing waiting" are
    // different answers, and collapsing them means a reply sits unseen because
    // a query blipped. Say the query failed and let the caller keep its state.
    if (error) {
      console.error('[web-messages] unread query failed:', error.message)
      return json({ error: 'Could not check messages' }, 503)
    }
    return json({ count: count || 0 })
  }

  // ── Fetch thread + mark read ──────────────────────────────
  if (action === 'fetch') {
    const { data, error } = await sb
      .from('sms_messages')
      .select('*')
      .eq('device_hash', device_hash)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[web-messages] fetch failed:', error.message)
      return json({ error: 'Failed to load messages' }, 500)
    }

    // Mark admin replies as read
    await sb
      .from('sms_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('device_hash', device_hash)
      .eq('direction', 'outbound')
      .is('read_at', null)

    return json({ messages: data })
  }

  // ── User reply ────────────────────────────────────────────
  if (action === 'reply') {
    const body = (payload.body || '').trim()
    if (!body) return json({ error: 'Empty message' }, 400)

    const handle = payload.handle || null
    const avatar = payload.avatar || null

    // Store message
    const { error } = await sb.from('sms_messages').insert({
      phone: 'web',
      direction: 'inbound',
      body,
      device_hash,
      handle,
      avatar,
    })

    if (error) {
      console.error('[web-messages] insert failed:', error.message)
      return json({ error: 'Failed to save message' }, 500)
    }

    // Buzz admin phone via Twilio
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN')
    const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER')
    const contactPhone = Deno.env.get('CONTACT_PHONE')

    if (twilioSid && twilioAuth && twilioFrom && contactPhone) {
      try {
        const who = handle ? `${avatar || ''} @${handle}`.trim() : 'Someone'
        const smsBody = `Lafayette Square [${who}] replied:\n${body}`
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(twilioSid + ':' + twilioAuth)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: contactPhone,
              From: twilioFrom,
              Body: smsBody,
            }),
          }
        )
      } catch (err) {
        console.error('[web-messages] Twilio notify failed:', err.message)
      }
    }

    return json({ sent: true })
  }

  return json({ error: 'Unknown action' }, 400)
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
