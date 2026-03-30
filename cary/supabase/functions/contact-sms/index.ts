/**
 * Cary — Contact SMS
 *
 * Receives a message from the website contact modal and:
 * 1. Sends it as an SMS to the owner's phone via Twilio
 * 2. Forwards to email via SendGrid (backup)
 * 3. Logs to Supabase contact_messages table (if it exists)
 *
 * Required Supabase secrets:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *   CONTACT_PHONE (the phone number to receive the text, e.g. +13145551234)
 *   SENDGRID_API_KEY (optional — enables email backup)
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
  const deviceHash = body.device_hash || null
  const handle = body.handle || null
  const avatar = body.avatar || null
  if (!message) return json({ error: 'Message is empty' }, 400)
  if (message.length > 1600) return json({ error: 'Message too long (1600 char max)' }, 400)

  // ── Send SMS to owner via Twilio ────────────────────────────────
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN')
  const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER')
  const contactPhone = Deno.env.get('CONTACT_PHONE')
  let smsSent = false

  if (twilioSid && twilioAuth && twilioFrom && contactPhone) {
    try {
      const who = handle ? `${avatar || ''} @${handle}`.trim() : 'Anonymous'
      const smsBody = `Lafayette Square [${who}]:\n${message}`
      const res = await fetch(
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
      smsSent = res.ok
      if (!res.ok) {
        const err = await res.text()
        console.error('[contact-sms] Twilio error:', err)
      }
    } catch (err) {
      console.error('[contact-sms] Twilio send failed:', err.message)
    }
  } else {
    console.warn('[contact-sms] Twilio not configured — skipping SMS')
  }

  // ── Forward to email (backup) ───────────────────────────────────
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
            value: `Message from website contact form:\n\n${message}\n\n---\nSent from the Lafayette Square contact modal.`,
          }],
        }),
      })
      emailSent = res.ok
    } catch (err) {
      console.error('[contact-sms] Email forward failed:', err.message)
    }
  }

  // ── Log to sms_messages ────────────────────────────────────────
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const sb = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )
    await sb.from('sms_messages').insert({
      phone: 'web',
      direction: 'inbound',
      body: message,
      device_hash: deviceHash,
      handle,
      avatar,
    })
  } catch (err) {
    console.error('[contact-sms] DB log failed:', err.message)
  }

  // Succeed if either channel delivered
  if (smsSent || emailSent) {
    return json({ sent: true, sms: smsSent, email: emailSent }, 200)
  }

  return json({ error: 'Delivery failed — neither SMS nor email configured' }, 503)
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
