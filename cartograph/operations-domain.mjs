/**
 * productionDomainFor(mapId) — a town's production domain, ASKED OF OPERATIONS, never held here.
 *
 * ⭐ THE DOMAIN'S ONE HOME IS OPERATIONS (Jacob, 2026-09-26). A Ward record there carries the
 * town's `mapId` and `domain`; the domain's own record says whether we own it (on the registrar
 * list) and what Cloudflare said about its zone at the last sync. This module reads that through
 * `GET /api/production-domain/<mapId>` with a Cloudflare Access SERVICE TOKEN, which Operations
 * gives a read-only "publisher" role and nothing else (theward-operations `src/index.js`).
 * ⛔ Nothing is copied into this repo: `src/instances/<map>.js#domain` stopped being a source the
 * same day (Lafayette Square's stays until its own cutover step).
 *
 * ⛔ EVERY ANSWER THAT IS NOT "OWNED AND ACTIVE" IS A REFUSAL WITH ITS REASON. There is no
 * default domain and no guess — a Promote that picked a domain it could not confirm could put a
 * town on an address that is not ours, or on one whose DNS does not reach this Worker.
 *
 * Config (dev-server environment, never committed):
 *   OPERATIONS_URL            default https://operations.theward.online
 *   OPS_ACCESS_CLIENT_ID      the service token's client id
 *   OPS_ACCESS_CLIENT_SECRET  its secret
 */

const OPERATIONS_URL = (process.env.OPERATIONS_URL || 'https://operations.theward.online').replace(/\/+$/, '')

import { decideProductionDomain } from '../src/lib/productionDomain.js'
export { decideProductionDomain }

/**
 * askOperations(mapId) — the ONE read of `GET /api/production-domain/<mapId>`, undecided.
 * ⭐ Two readers, one fetch: Promote decides on it (`productionDomainFor`, below), and Extent's
 * web-address field shows it (serve.js GET /address/<name>, BRIEF-nyc-adapter §3.0).
 *   { asked: false, why }            — Operations could not be ASKED (no token, unreachable, refused)
 *   { asked: true, status, answer }  — Operations answered; `answer` is its body ({ … } or { error })
 * ⛔ "Could not ask" is never folded into "no Ward" — they are different facts, and the field says which.
 */
export async function askOperations(mapId) {
  const id = process.env.OPS_ACCESS_CLIENT_ID, secret = process.env.OPS_ACCESS_CLIENT_SECRET
  if (!id || !secret) {
    return { asked: false, why: 'the dev server has no Operations service token (OPS_ACCESS_CLIENT_ID / '
      + 'OPS_ACCESS_CLIENT_SECRET), so it cannot ask which domain this town owns — OPERATIONS.md § Production sites' }
  }
  let res
  try {
    res = await fetch(`${OPERATIONS_URL}/api/production-domain/${encodeURIComponent(mapId)}`, {
      headers: { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret }, cache: 'no-store' })
  } catch (e) {
    return { asked: false, why: `could not reach Operations: ${e.message}` }
  }
  let body = null
  try { body = await res.json() } catch { /* Access answers a refused token with HTML */ }
  if (!res.ok && !body?.error) return { asked: false, why: `Operations answered ${res.status}${res.status === 403 ? ' — the service token was refused' : ''}` }
  return { asked: true, status: res.status, answer: body }
}

export async function productionDomainFor(mapId) {
  const r = await askOperations(mapId)
  if (!r.asked) return { domain: null, why: r.why }
  return decideProductionDomain(mapId, r.answer)
}
