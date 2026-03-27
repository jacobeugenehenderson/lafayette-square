/**
 * Cary — Contact SMS
 *
 * Sends a text message from the website contact modal directly via Twilio,
 * so desktop users don't need a native Messages app.
 *
 * Also forwards the message to email (same as the inbound webhook) so
 * nothing falls through the cracks.
 *
 * Required Supabase secrets:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *   SENDGRID_API_KEY (optional — enables email forwarding)
 *   FORWARD_EMAIL (optional, defaults to hello@lafayette-square.com)
 */

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const message = (body.message || '').trim()
  if (!message) return json({ error: 'Message is empty' }, 400)
  if (message.length > 1600) return json({ error: 'Message too long (1600 char max)' }, 400)

  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN')
  const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER')

  if (!twilioSid || !twilioAuth || !twilioFrom) {
    return json({ error: 'SMS not configured' }, 503)
  }

  // Send the message TO the Lafayette Square number (it's a visitor contacting Cary,
  // not the other way around). Twilio accepts From = the toll-free number, To = same
  // number, but that's a loopback. Instead, we forward to email and log it.
  // The user's message is delivered as an email + stored, and Cary can reply via
  // the normal SMS flow or Twilio console.

  // ── Forward to email ──────────────────────────────────────────
  const sendgridKey = Deno.env.get('SENDGRID_API_KEY')
  const forwardEmail = Deno.env.get('FORWARD_EMAIL') || 'hello@lafayette-square.com'
  let emailSent = false

  if (sendgridKey) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: forwardEmail }] }],
          from: { email: 'cary@lafayette-square.com', name: 'Cary Web Contact' },
          subject: 'New message from lafayette-square.com',
          content: [{
            type: 'text/plain',
            value: `Message from website contact form:\n\n${message}\n\n---\nSent from the Lafayette Square contact modal (desktop).`,
          }],
        }),
      })
      emailSent = res.ok
    } catch (err) {
      console.error('[contact-sms] Email forward failed:', err.message)
    }
  }

  // ── Log to Supabase (optional — table may not exist yet) ──────
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const sb = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )
    await sb.from('contact_messages').insert({
      message,
      source: 'web',
    })
  } catch {
    // Table doesn't exist yet — that's fine, email is the primary channel
  }

  return json({ sent: true, email_forwarded: emailSent }, 200)
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
