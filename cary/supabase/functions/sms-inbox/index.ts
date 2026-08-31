/**
 * Cary — SMS Inbox (Admin)
 *
 * Returns all SMS messages for the admin inbox.
 *
 * POST body: { admin_token }
 *
 * Required Supabase secrets:
 *   APPS_SCRIPT_URL (Google Apps Script backend for admin-verify)
 */

const CORS = {
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

  const { admin_token } = payload

  if (!await verifyAdmin(admin_token)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    // ⛔ NEWEST THOUSAND, NOT OLDEST. This ordered `ascending: true` under the
    // same limit, so past 1000 messages the inbox would have returned the
    // earliest thousand and silently stopped showing anything new — the worst
    // failure an inbox has, and one that arrives quietly on the day the count
    // crosses over rather than announcing itself.
    // ⭐ THE ORDER IT RETURNS IS STILL ASCENDING, deliberately: the client reads
    // `msgs[msgs.length - 1]` as a thread's latest message and scrolls threads to
    // the bottom. So the SELECT takes the newest 1000 and the reverse hands them
    // back oldest-first — the window moves, the contract does not.
    const { data, error } = await sb
      .from('sms_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) throw error
    const messages = (data || []).slice().reverse()

    // Enrich with profile data for known phone numbers
    const phones = [...new Set(messages.map(m => m.phone))]
    let profiles: Record<string, { display_name: string; neighborhood_relationship: string | null }> = {}
    if (phones.length > 0) {
      const { data: pData } = await sb
        .from('profiles')
        .select('phone, display_name, neighborhood_relationship')
        .in('phone', phones)
      if (pData) {
        for (const p of pData) {
          profiles[p.phone] = { display_name: p.display_name, neighborhood_relationship: p.neighborhood_relationship }
        }
      }
    }

    return json({ messages, profiles })
  } catch (err) {
    console.error('[sms-inbox] query failed:', err.message)
    return json({ error: 'Failed to load messages' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
