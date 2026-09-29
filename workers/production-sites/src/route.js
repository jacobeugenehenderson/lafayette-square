/**
 * route — what a production request is, decided from the HOST's record and the path alone.
 *
 * Pure, so `checks/claims-a-production-host-serves-only-its-own-town.mjs` can drive it with no
 * Cloudflare in the loop. `index.js` does the I/O; every decision about WHICH TOWN lives here.
 *
 * ⛔⛔ ONE HOST, ONE TOWN. A host's record names one map and one look. Every key this returns is
 * inside that town — its pinned player, or a prod key whose SECOND segment is its look
 * (`baked/<look>/…`, `live/<look>/…`, `setpieces/<look>/…`). ⭐ There is no list of key spaces:
 * the rule is the look's position in the key, so a new kind of per-look artifact is served the
 * day it is written, and no path can name another town's.
 */

export const MAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
export const PLAYER_SEGMENT = '_player'
// The Ward's build (`ward/<sha>/`) and the renderer's own files (`kit/<sha>/`) — each keyed by a git
// commit, immutable, copied from staging by Promote (`scripts/promote-player-to-prod.mjs`).
export const WARD_SEGMENT = '_ward'
export const KIT_SEGMENT = 'kit'
const SHA = /^[0-9a-f]{40}$/
export const looksLikeFile = (p) => /\.[a-z0-9]{2,5}$/i.test(p)

/** `hosts/<host>.json` — written by Promote, the only writer. */
export const hostKey = (host) => `hosts/${host}.json`
/** Each town pins its own copy of the player, so promoting one town changes no other. */
export const playerPrefix = (map) => `player/${map}/`

/**
 * `www.<apex>` → the apex, path and query kept. Decided before any record is read: the www name
 * is bound only so an old habit lands, and it must never become a second address for the town.
 */
export function wwwRedirect(url) {
  if (!url.hostname.startsWith('www.')) return null
  const to = new URL(url)
  to.hostname = url.hostname.slice(4)
  return to.toString()
}

/**
 * ⛔⛔ WHICH PLAYER — the host record says, and nothing else may (BRIEF-ls-onto-the-ward Phase 2).
 * A `v: 2` record names `app: 'ward' | 'legacy'`; a Ward record also pins `ward` and `kit` shas.
 * ⭐ A record with NO `v` is legacy ONLY IF ITS SHAPE PROVES IT (Boz, 2026-09-29): Promote before the
 * field wrote `player` as the kit player's build TIMESTAMP, and could pin nothing else. ⛔ A v-less
 * record without that timestamp is not "probably legacy" — it is a 500 that names the town;
 * reading bare absence as legacy would be the default player the brief forbids, renamed.
 * ⛔ A v2 record with any other app, or any other version, refuses.
 * @returns {{app: 'ward'|'legacy'} | {refuse: string}}
 */
export function appOf(rec) {
  if (rec?.v == null) {
    const t = rec?.player
    if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(t) && !Number.isNaN(Date.parse(t))) return { app: 'legacy' }
    return { refuse: `"${rec?.map}"'s host record names no player: no "v"/"app", and no pre-v2 player build timestamp. Promote it again.` }
  }
  if (rec.v !== 2) return { refuse: `this host's record is version ${JSON.stringify(rec.v)}; this Worker reads 2.` }
  if (rec.app === 'legacy') return { app: 'legacy' }
  if (rec.app === 'ward') {
    if (!SHA.test(rec.ward || '') || !SHA.test(rec.kit || '')) {
      return { refuse: `this host's record plays the Ward but does not pin a Ward commit ("ward") and a kit commit ("kit"): ${JSON.stringify(rec)}` }
    }
    return { app: 'ward' }
  }
  return { refuse: `this host's record names player ${JSON.stringify(rec.app)}; a town plays "ward" or "legacy". Promote it again.` }
}

/**
 * @param {string} pathname  the request path
 * @param {{map: string, look: string, v?: 2, app?: string, ward?: string, kit?: string}} rec  the host's record
 * @returns {{kind: 'player'|'slab'|'document'|'refuse', key?: string, status?: number, why?: string}}
 */
export function route(pathname, rec) {
  if (!rec || !MAP_ID.test(rec.map || '') || !MAP_ID.test(rec.look || '')) {
    return { kind: 'refuse', status: 500, why: `this host's record is malformed: ${JSON.stringify(rec)}` }
  }
  const which = appOf(rec)
  if (which.refuse) return { kind: 'refuse', status: 500, why: which.refuse }
  const ward = which.app === 'ward'
  const parts = pathname.replace(/^\/+/, '').split('/')
  const first = parts[0] || ''
  if (parts.includes('..')) return { kind: 'refuse', status: 400, why: `not a path: "${pathname}"` }

  if (first === PLAYER_SEGMENT) {
    if (ward) return { kind: 'refuse', status: 404, why: `"${rec.map}" plays the Ward; there is no ${PLAYER_SEGMENT} here.` }
    const rel = parts.slice(1).join('/') || 'index.html'
    return { kind: 'player', key: playerPrefix(rec.map) + rel }
  }
  // ⛔ Only the ONE pinned commit of each: another sha is not this town's, whatever the bucket holds.
  if (first === WARD_SEGMENT || first === KIT_SEGMENT) {
    const pinned = first === WARD_SEGMENT ? rec.ward : rec.kit
    const rel = parts.slice(2).join('/')
    if (!ward) return { kind: 'refuse', status: 404, why: `"${rec.map}" plays the kit's player; there is no /${first}/ here.` }
    if (parts[1] !== pinned || !rel) {
      return { kind: 'refuse', status: 404, why: `"${rec.map}" pins ${first === WARD_SEGMENT ? 'Ward build' : 'kit'} ${pinned}; "${parts[1] || ''}" is not it.` }
    }
    return { kind: first === WARD_SEGMENT ? 'ward' : 'kit', key: `${first === WARD_SEGMENT ? 'ward' : 'kit'}/${pinned}/${rel}` }
  }

  const rest = parts.join('/')
  if (rest && looksLikeFile(rest)) {
    // ⭐ The slab and everything else per-look sits at `<space>/<look>/…` in the prod keys.
    if (parts.length >= 3 && parts[1] === rec.look && !parts.includes('..')) {
      return { kind: 'slab', key: rest }
    }
    return { kind: 'refuse', status: 404,
      why: parts.length >= 3 && MAP_ID.test(parts[1])
        ? `"${parts[1]}" is not this site's town — this site serves "${rec.look}" only.`
        : `there is no "${rest}" here.` }
  }

  // Everything else is a route inside the SPA and gets this town's player.
  return ward
    ? { kind: 'document', app: 'ward', key: `ward/${rec.ward}/index.html` }
    : { kind: 'document', app: 'legacy', key: playerPrefix(rec.map) + 'index.html' }
}
