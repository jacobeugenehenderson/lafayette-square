/**
 * Cary — Inbound SMS Webhook
 *
 * Twilio sends incoming texts here. This function:
 * 1. Forwards the message to email (hello@lafayette-square.com)
 * 2. Sends an auto-reply if outside business hours
 *
 * Configure in Twilio:
 *   Messaging Service → Integration → Incoming Messages → Send a webhook
 *   URL: https://ngbvgjzrpnfrqmzkqvch.supabase.co/functions/v1/sms-webhook
 *   Method: POST
 *
 * Required Supabase secrets:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *   FORWARD_EMAIL (optional, defaults to hello@lafayette-square.com)
 *   SENDGRID_API_KEY (for email forwarding, optional)
 *   TWILIO_WEBHOOK_URL (optional) — the EXACT URL configured in the Twilio
 *     console, if it differs from what this function sees as `req.url`
 *     (proxies rewrite host/proto). Twilio signs that exact string.
 *
 * ⛔ AUTH: this endpoint is public and unauthenticated by nature — Twilio is
 * the caller. The X-Twilio-Signature HMAC is therefore the ONLY thing that
 * distinguishes a real inbound text from a forged POST. See SECURITY.md F-5.
 */

/**
 * Verify Twilio's X-Twilio-Signature over the request.
 *
 * Twilio's scheme: HMAC-SHA1, keyed on the account's auth token, over
 * `url + concat(sorted(param key + param value))`, base64-encoded.
 *
 * ⛔ NO FAIL-OPEN. A missing TWILIO_AUTH_TOKEN REJECTS the request — it does
 * not skip the check. That is the F-11 mistake (`if (cronSecret && …)`) and
 * making it here would mean a forged POST is indistinguishable from a real
 * text whenever the secret is unset. An unverifiable request is a rejected one.
 */
async function verifyTwilioSignature(req, params) {
  const signature = req.headers.get('X-Twilio-Signature')
  if (!signature) return { ok: false, why: 'missing X-Twilio-Signature' }

  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  if (!authToken) return { ok: false, why: 'TWILIO_AUTH_TOKEN not configured — cannot verify, refusing' }

  const url = Deno.env.get('TWILIO_WEBHOOK_URL') || req.url

  // url, then every param sorted by key, key and value concatenated raw.
  let payload = url
  for (const key of [...params.keys()].sort()) payload += key + params.get(key)

  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(payload))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  if (!timingSafeEqual(expected, signature)) return { ok: false, why: 'signature mismatch' }
  return { ok: true }
}

/** Length-independent constant-time-ish compare, so we leak no prefix info. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Escape a value for interpolation into TwiML (F-9).
 * The inbound body is attacker-controlled text; unescaped, `</Message>` in a
 * text message rewrites the XML Twilio then executes.
 */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

Deno.serve(async (req) => {
  // Twilio sends form-encoded POST
  const formData = await req.formData()

  // ── F-5 · Verify the signature BEFORE anything else ────────
  // Everything below this line spends money (SendGrid, Twilio) or writes rows.
  // None of it may run for a request we cannot prove came from Twilio.
  const verdict = await verifyTwilioSignature(req, formData)
  if (!verdict.ok) {
    console.warn(`[sms-webhook] REJECTED unverified request: ${verdict.why}`)
    return new Response('Forbidden', { status: 403 })
  }

  const from = formData.get('From') || ''
  const body = formData.get('Body') || ''
  const messageSid = formData.get('MessageSid') || ''

  console.log(`[sms-webhook] From: ${from}, Body: ${body.slice(0, 100)}`)

  // ── Forward to email ──────────────────────────────────────
  const sendgridKey = Deno.env.get('SENDGRID_API_KEY')
  const forwardEmail = Deno.env.get('FORWARD_EMAIL') || 'hello@lafayette-square.com'

  if (sendgridKey) {
    try {
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: forwardEmail }] }],
          from: { email: 'cary@lafayette-square.com', name: 'Cary SMS' },
          subject: `Text from ${from}`,
          content: [{ type: 'text/plain', value: `From: ${from}\nMessage: ${body}\n\nReply directly to this number via Twilio or text back from your phone.` }],
        }),
      })
    } catch (err) {
      console.error('[sms-webhook] Email forward failed:', err.message)
    }
  }

  // ── Log to sms_messages ────────────────────────────────────
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    await sb.from('sms_messages').insert({
      phone: from,
      direction: 'inbound',
      body: body,
      twilio_sid: messageSid,
    })
  } catch (err) {
    console.error('[sms-webhook] DB log failed:', err.message)
  }

  // ── Auto-reply if outside hours ───────────────────────────
  // Business hours: 9 AM - 9 PM Central
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const hour = now.getHours()
  const isOffHours = hour < 9 || hour >= 21

  let replyBody = null
  if (isOffHours) {
    replyBody = "Thanks for reaching out! Someone will get back to you during business hours."
  }

  // Respond with TwiML — forward + optional auto-reply
  const fwdPhone = Deno.env.get('FORWARD_PHONE')
  // F-9 · every interpolated value is escaped — `body` is attacker-controlled.
  let twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>`
  if (replyBody) twiml += `<Message>${escapeXml(replyBody)}</Message>`
  if (fwdPhone && from !== fwdPhone) {
    twiml += `<Message to="${escapeXml(fwdPhone)}">[${escapeXml(from)}] ${escapeXml(body)}</Message>`
  }
  twiml += `</Response>`

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
})
