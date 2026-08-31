/**
 * Cary — Contact SMS
 *
 * Receives a message from the Ward's "Text us" button and:
 * 1. Sends it as an SMS to the Host's phone via Twilio
 * 2. Forwards to email via SendGrid (backup)
 * 3. Logs to sms_messages
 *
 * ⛔ THIS ENDPOINT IS PUBLIC BY DESIGN AND SPENDS MONEY ON EVERY CALL.
 * There is no caller to authenticate — the whole point is that a stranger can
 * reach the Host. So the ONLY thing standing between a `while true; do curl`
 * and a flooded personal phone is the rate limiting below. Treat it as the
 * load-bearing part of this file, not as hygiene. See SECURITY.md F-13.
 *
 * Required Supabase secrets:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *   CONTACT_PHONE (the phone number to receive the text, e.g. +13145551234)
 *   SENDGRID_API_KEY (optional — enables email backup)
 *   FORWARD_EMAIL (optional, defaults to hello@lafayette-square.com)
 *   CONTACT_ALLOWED_ORIGINS (optional, comma-separated — extends the list below)
 *   CONTACT_CAP_GLOBAL_DAY / _IP_HOUR / _DEVICE_HOUR (optional overrides)
 */

// ── Origin allowlist ────────────────────────────────────────────
// ⚠️ CORS is a BROWSER rule and nothing else. It stops another site from making
// YOUR visitors' browsers post here; it does nothing about curl or a script,
// which never ask. Free and worth having — but the caps are the actual wall.
// ⭐ A QR is unaffected: it deep-links into the Ward, so the call comes from our
// own origin by construction.
const DEFAULT_ORIGINS = [
  'https://lafayette-square.com',
  'https://www.lafayette-square.com',
  'https://jacobhenderson.studio',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Staging: .github/workflows/staging.yml publishes dist to
  // jacobeugenehenderson/lafayette-square-staging via GitHub Pages.
  // ⚠️ An Origin is scheme+host with NO path, so this admits every page on that
  // github.io account, not just /lafayette-square-staging/. Accepted knowingly:
  // the caps below are the actual wall, and CORS only ever stopped a stranger's
  // site from using a VISITOR's browser — never curl, which does not ask.
  // ⭐ Without this, a QR tested on staging fails with "Couldn't reach the
  // message service" — a blocked origin that reads exactly like a Twilio outage.
  'https://jacobeugenehenderson.github.io',
]

function allowedOrigins() {
  const extra = (Deno.env.get('CONTACT_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return [...DEFAULT_ORIGINS, ...extra]
}

/** Echo the origin only if it is ours; otherwise send no ACAO at all. */
function corsHeaders(req) {
  const origin = req.headers.get('Origin')
  const headers = {
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
    Vary: 'Origin',
  }
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

// ── Rate limiting ───────────────────────────────────────────────
// Defaults are deliberately GENEROUS: the visible symptom of getting these
// wrong is the Host's contact button quietly failing for real people, which is
// worse than a slightly leaky cap. ⛔ A missing/garbage env var falls back to
// the DEFAULT, never to "unlimited" — the safe direction.
function cap(name, fallback) {
  const raw = Number(Deno.env.get(name))
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

/** Salted, non-reversible key for the sender's address. */
async function hashIp(ip) {
  if (!ip) return null
  const salt = Deno.env.get('IP_HASH_SALT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

function clientIp(req) {
  // Supabase sits behind a proxy; the left-most XFF entry is the real client.
  const xff = req.headers.get('x-forwarded-for')
  return xff?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || null
}

/**
 * Ask sms_messages how much traffic this source has already sent.
 * ⛔ Fails CLOSED: if the count cannot be read we refuse, because the
 * alternative is an unmetered money-spending endpoint. An outage on the
 * contact button is recoverable; an unbounded Twilio bill is not.
 */
async function overLimit(sb, { ipHash, deviceHash }) {
  const since = (mins) => new Date(Date.now() - mins * 60_000).toISOString()

  const windows = [
    {
      label: 'global/day',
      limit: cap('CONTACT_CAP_GLOBAL_DAY', 200),
      build: () => sb.from('sms_messages').select('id', { count: 'exact', head: true })
        .eq('phone', 'web').eq('direction', 'inbound').gte('created_at', since(60 * 24)),
    },
    ipHash && {
      label: 'ip/hour',
      limit: cap('CONTACT_CAP_IP_HOUR', 10),
      build: () => sb.from('sms_messages').select('id', { count: 'exact', head: true })
        .eq('sender_ip_hash', ipHash).gte('created_at', since(60)),
    },
    deviceHash && {
      label: 'device/hour',
      limit: cap('CONTACT_CAP_DEVICE_HOUR', 5),
      build: () => sb.from('sms_messages').select('id', { count: 'exact', head: true })
        .eq('device_hash', deviceHash).gte('created_at', since(60)),
    },
  ].filter(Boolean)

  for (const w of windows) {
    const { count, error } = await w.build()
    if (error) {
      console.error(`[contact-sms] rate-limit query failed (${w.label}) — refusing:`, error.message)
      return { over: true, which: `${w.label} (unreadable)` }
    }
    if ((count ?? 0) >= w.limit) return { over: true, which: `${w.label} ${count}/${w.limit}` }
  }
  return { over: false }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)

  // CORS preflight
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400, cors)
  }

  const message = (body.message || '').trim()
  const deviceHash = body.device_hash || null
  const handle = body.handle || null
  const avatar = body.avatar || null
  if (!message) return json({ code: 'empty', error: 'Message is empty' }, 400, cors)
  if (message.length > 1600) return json({ code: 'too_long', error: 'Message too long (1600 character max)' }, 400, cors)

  // ── RATE LIMIT · before anything spends money ───────────────────
  // ⛔ This must stay ABOVE the Twilio and SendGrid calls. A limit checked
  // after the send is not a limit.
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  const sb = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )
  const ipHash = await hashIp(clientIp(req))

  const limit = await overLimit(sb, { ipHash, deviceHash })
  if (limit.over) {
    // Loud, and with the window named — a silently dropped message from a real
    // neighbour is the failure mode to be able to diagnose in one look.
    console.warn(`[contact-sms] REFUSED — rate limit: ${limit.which}`)
    return json(
      { code: 'rate_limited', error: "You've sent a few messages just now — please try again in a little while." },
      429,
      cors
    )
  }

  // ── Log FIRST, so the alert can deep-link to this exact message ──
  // ⭐ Order matters twice over. The row is what the Host's tap-through link
  // points at, AND it is the rate-limit counter — writing it before the send
  // means a message still counts even if Twilio then fails, which is the safe
  // direction for a spend limiter.
  let messageId = null
  try {
    const { data: row, error: logErr } = await sb
      .from('sms_messages')
      .insert({
        phone: 'web',
        direction: 'inbound',
        body: message,
        device_hash: deviceHash,
        sender_ip_hash: ipHash,
        handle,
        avatar,
      })
      .select('id')
      .single()
    if (logErr) throw new Error(logErr.message)
    messageId = row?.id ?? null
  } catch (err) {
    console.error(`[contact-sms] DB log FAILED — this send is uncounted for rate limiting: ${err.message}`)
  }

  // Tap-through link into the Host's SMS Inbox, straight to this thread.
  // ⛔ Deliberately the MESSAGE id, never the device_hash: the hash is a bearer
  // token (SECURITY.md F-6) and would then live in the Host's message history
  // and Twilio's logs forever. A message id grants nothing on its own and the
  // Inbox is admin-gated regardless.
  // ⭐ The link points back at THE SITE THEY ACTUALLY USED. One Supabase project
  // serves production and staging, so a single configured domain is always wrong
  // for one of them — a reply link that lands on the other site opens a build
  // that knows nothing about this message.
  // ⛔ SECURITY: only ever an origin already on the allowlist. An attacker can
  // set `Origin` to anything, and echoing it unchecked would put a link to THEIR
  // site in the Host's text message — a phishing vector, sent from us, to us.
  // The allowlist we already keep for CORS is exactly the right boundary.
  const origin = req.headers.get('Origin')
  const linkBase = origin && allowedOrigins().includes(origin)
    ? origin
    : Deno.env.get('CONTACT_SITE_URL') || null
  if (!linkBase) {
    console.warn('[contact-sms] no allowed Origin and no CONTACT_SITE_URL — alert will carry no reply link')
  }
  const replyLink = linkBase && messageId ? `${linkBase.replace(/\/$/, '')}/?msg=${messageId}` : null

  // ── Send SMS to owner via Twilio ────────────────────────────────
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN')
  const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER')
  const contactPhone = Deno.env.get('CONTACT_PHONE')
  let smsSent = false

  if (twilioSid && twilioAuth && twilioFrom && contactPhone) {
    try {
      const who = handle ? `${avatar || ''} @${handle}`.trim() : 'Anonymous'
      const smsBody =
        `Lafayette Square [${who}]:\n${message}` +
        (replyLink ? `\n\nReply: ${replyLink}` : '')
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

  // Succeed if either channel delivered
  if (smsSent || emailSent) {
    return json({ sent: true, sms: smsSent, email: emailSent }, 200, cors)
  }

  // ⛔ Distinct from a rate limit: nothing the sender did, and retrying will not
  // help. Saying "try again later" here would be a lie.
  return json(
    { code: 'delivery_failed', error: 'Message could not be delivered right now.' },
    503,
    cors
  )
})

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}
