/**
 * Cary — commerce-write
 *
 * The ONLY way anything is written to `commerce_items` / `commerce_places`
 * (migration 018). Those tables carry no write policy at all, deliberately:
 * guardianship lives in the GAS Guardians sheet keyed by device hash, Postgres
 * cannot see a spreadsheet, and Supabase auth knows only an anonymous uid
 * (migration 010). Any RLS rule we could have written would have been a rule
 * about someone we cannot identify. So authority is delegated to the system that
 * actually holds it, and this function is the door.
 *
 * ⭐ THIS IS EXACTLY AS STRONG AS THE EXISTING GUARDIAN WRITE PATH, AND NO
 * STRONGER — by construction, because it asks the same authority the same
 * question. A menu edit in the Ward already works this way: the client's
 * `lsq_guardian_listings` is a localStorage CACHE and is never trusted, and
 * `Code.js` re-verifies the device hash against the sheet before mutating
 * (ls/STATUS.md §6). ⛔ So do not "improve" this by trusting a role the client
 * sends — that would make commerce the weakest door in the building.
 *
 * Required Supabase secrets:
 *   GAS_API_URL              the Apps Script /exec URL (worker.js:1 has it)
 *   COMMERCE_SHARED_SECRET   must equal the GAS script property of the same name
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (provided by the platform)
 *
 * ⛔ Every one of those is required and there is no degraded mode. A missing
 * secret returns 503 and writes nothing. The failure we refuse to build is the
 * one where an unconfigured deployment quietly accepts writes.
 */

const DEFAULT_ORIGINS = [
  'https://lafayette-square.com',
  'https://www.lafayette-square.com',
  'https://jacobhenderson.studio',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://jacobeugenehenderson.github.io',
]

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin')
  const extra = (Deno.env.get('COMMERCE_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean)
  const allowed = [...DEFAULT_ORIGINS, ...extra]
  return {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // ⛔ `x-device-hash` is not optional — `fetchWithDeviceHash` (src/lib/supabase.js)
    // attaches it to every call, and a header missing here makes the BROWSER block
    // the request after a successful preflight. The function never runs and the
    // client reports only "Failed to send a request to the Edge Function", which
    // is indistinguishable from the service being down.
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-hash',
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : DEFAULT_ORIGINS[0],
    Vary: 'Origin',
  }
}

const json = (body: unknown, status = 200, cors: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/**
 * Ask GAS whether this device hash may edit this listing's menu.
 *
 * ⛔ FAILS CLOSED ON EVERY PATH. A network error, a non-200, malformed JSON, a
 * missing field — all return false. The one outcome that must never arise is
 * "we could not reach the authority, so we allowed it."
 */
async function mayEditMenu(listingId: string, deviceHash: string): Promise<boolean> {
  const base = Deno.env.get('GAS_API_URL')
  const secret = Deno.env.get('COMMERCE_SHARED_SECRET')
  if (!base || !secret) return false

  const url = `${base}?action=guardian-check&lid=${encodeURIComponent(listingId)}` +
              `&dh=${encodeURIComponent(deviceHash)}&perm=menu&s=${encodeURIComponent(secret)}`
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return false
    const body = await res.json()
    return body?.allowed === true
  } catch (e) {
    console.error('[commerce-write] guardian-check unreachable —', (e as Error)?.message)
    return false
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  if (!Deno.env.get('GAS_API_URL') || !Deno.env.get('COMMERCE_SHARED_SECRET')) {
    console.error('[commerce-write] refusing: GAS_API_URL or COMMERCE_SHARED_SECRET is unset')
    return json({ code: 'unconfigured', error: 'Commerce writes are not configured' }, 503, cors)
  }

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400, cors) }

  const listingId = String(body.listing_id || '').trim()
  const deviceHash = String(body.device_hash || req.headers.get('x-device-hash') || '').trim()
  const op = String(body.op || '').trim()
  if (!listingId || !deviceHash) return json({ code: 'bad_request', error: 'listing_id and device_hash are required' }, 400, cors)

  // ── The gate. Nothing below runs until GAS says yes. ──────────────────────
  if (!(await mayEditMenu(listingId, deviceHash))) {
    return json({ code: 'unauthorized', error: 'Not a guardian of this listing, or the menu permission is not granted' }, 403, cors)
  }

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const events: any[] = []
  const now = new Date().toISOString()

  try {
    if (op === 'items') {
      // Bulk by design: confirming a poured menu one item at a time is the
      // difference between a sitting at the bar and an afternoon. The intake
      // regime confirms a whole menu in one call.
      const items = Array.isArray(body.items) ? body.items : []
      if (!items.length) return json({ code: 'bad_request', error: 'items[] is empty' }, 400, cors)
      if (items.length > 500) return json({ code: 'too_many', error: 'at most 500 items per call' }, 400, cors)

      const rows: any[] = []
      for (const it of items) {
        const itemId = String(it?.item_id || '').trim()
        if (!itemId || itemId.length > 64) return json({ code: 'bad_item', error: `bad item_id: ${itemId.slice(0, 32)}` }, 400, cors)

        const confirm = it.confirm === true
        const priceCents = it.price_cents == null ? null : Number(it.price_cents)

        // ⭐ A price is validated for being a PRICE — a positive integer — and
        // NOT for being a plausible one. There is no sanity ceiling here: a $900
        // item is a whole pig or a rare bottle, and refusing it would be calling
        // the operator's authoring a defect. The human confirmation IS the sanity
        // check, which is the entire reason this operation exists.
        if (priceCents != null && (!Number.isInteger(priceCents) || priceCents <= 0)) {
          return json({ code: 'bad_price', error: `price_cents must be a positive integer (item ${itemId})` }, 400, cors)
        }
        // Mirrors the schema's commerce_items_confirmed_has_price. Checked here
        // too so the caller gets a sentence rather than a constraint violation.
        if (confirm && priceCents == null) {
          return json({ code: 'confirm_needs_price', error: `cannot confirm ${itemId} without a price` }, 400, cors)
        }

        rows.push({
          listing_id: listingId,
          item_id: itemId,
          price_cents: priceCents,
          available: it.available === undefined ? true : it.available === true,
          confirmed_at: confirm ? now : null,
          updated_at: now,
        })
        events.push({
          listing_id: listingId, item_id: itemId,
          action: confirm ? 'confirm' : (it.available === false ? 'unavailable' : (priceCents != null ? 'reprice' : 'unconfirm')),
          price_cents: priceCents, actor: deviceHash, at: now,
        })
      }

      const { error } = await sb.from('commerce_items').upsert(rows, { onConflict: 'listing_id,item_id' })
      if (error) {
        console.error('[commerce-write] items upsert failed —', error.message)
        return json({ code: 'write_failed', error: error.message }, 500, cors)
      }

    } else if (op === 'place') {
      const patch: Record<string, unknown> = { listing_id: listingId, updated_at: now }
      if (body.ordering_paused !== undefined) patch.ordering_paused = body.ordering_paused === true
      if (body.min_order_cents !== undefined) {
        const v = Number(body.min_order_cents)
        if (!Number.isInteger(v) || v < 0) return json({ code: 'bad_minimum', error: 'min_order_cents must be a non-negative integer' }, 400, cors)
        patch.min_order_cents = v
      }
      // ⛔ tax_remitter IS DELIBERATELY NOT SETTABLE HERE. It records who remits
      // sales tax, which is a legal determination pending the Missouri DOR
      // marketplace-facilitator letter ruling — not a restaurant's preference and
      // not a guardian's to assert. It moves by migration or by an operator with
      // the service key, on the strength of the ruling.
      if (Object.keys(patch).length === 2) return json({ code: 'bad_request', error: 'nothing to set' }, 400, cors)

      const { error } = await sb.from('commerce_places').upsert(patch, { onConflict: 'listing_id' })
      if (error) {
        console.error('[commerce-write] place upsert failed —', error.message)
        return json({ code: 'write_failed', error: error.message }, 500, cors)
      }

    } else {
      return json({ code: 'bad_op', error: `unknown op: ${op}` }, 400, cors)
    }

    // ⚠️ Audit is appended AFTER the write and its failure does not fail the
    // call — the write already happened, and reporting failure would tell the
    // caller a lie in the other direction. It is logged loudly instead, because
    // a silent gap in the record is the thing that makes the audit worthless.
    if (events.length) {
      const { error } = await sb.from('commerce_item_events').insert(events)
      if (error) console.error('[commerce-write] AUDIT WRITE FAILED — the change stands but is unrecorded —', error.message)
    }

    return json({ ok: true, written: op === 'items' ? (body.items?.length || 0) : 1 }, 200, cors)
  } catch (e) {
    console.error('[commerce-write] threw —', (e as Error)?.message)
    return json({ code: 'error', error: 'Commerce write failed' }, 500, cors)
  }
})
