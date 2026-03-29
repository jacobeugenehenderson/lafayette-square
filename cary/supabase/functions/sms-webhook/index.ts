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
 */

Deno.serve(async (req) => {
  // Twilio sends form-encoded POST
  const formData = await req.formData()
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

  // ── Forward to personal phone via SMS ────────────────────
  const forwardPhone = Deno.env.get('FORWARD_PHONE')
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const twilioNumber = Deno.env.get('TWILIO_PHONE_NUMBER')

  if (forwardPhone && twilioSid && twilioToken && twilioNumber && from !== forwardPhone) {
    try {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: forwardPhone,
          From: twilioNumber,
          Body: `[${from}] ${body}`,
        }),
      })
    } catch (err) {
      console.error('[sms-webhook] SMS forward failed:', err.message)
    }
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

  // Respond with TwiML
  const twiml = replyBody
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyBody}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
})
