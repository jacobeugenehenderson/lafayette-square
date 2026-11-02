/**
 * stagingPlayer — WHICH PLAYER A TOWN'S STAGING SITE SERVES, AND IS IT THERE? One answer, for Preview's status, the
 * Promote gate and (commit 2) the staging Worker, so the panel, the gate and the served page cannot disagree.
 *
 * ⭐ EVERY TOWN PLAYS THE WARD (the legacy kit player was retired, 2026-11-01, Boz's ruling A: retire it, don't filter
 * it). A town's staging record (`staging/sites/<map>/player.json`, written by scripts/set-staging-player.mjs) names
 * `ward`; the Ward's staging pointer (`staging/ward/current.json`) names the Ward build and the kit commit it was built
 * against; that build's document and that kit's bundle must both be on the asset host.
 * ⛔ It used to read the legacy player's build marker (`staging/player/build.json`) for every town, so a Promote waited on
 * a rebuild of a player no visitor runs (Boz, 2026-11-01: Jacob had to press "Publish player" to unblock it).
 * ⛔ No record, an unreadable or unknown one, a record naming the retired `legacy` player, no pointer, a pointer that does
 * not name two commits, a missing bundle or document: each refuses BY NAME, naming its key. Never a default player.
 *
 * `io`: { json(key) → the parsed object, or null when there is none · exists(key) → boolean }, so the caller decides how
 * the bucket is reached (serve.js over the asset host; the Worker through its binding).
 */
export const SITE_PREFIX = 'staging/sites/'
export const WARD_PREFIX = 'staging/ward/'
export const KIT_PREFIX = 'staging/kit/'

const isSha = (v) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v)

/** → { current: true, ward, kit } · { current: false, status, why } */
export async function stagingPlayerOf(map, io) {
  const recordKey = `${SITE_PREFIX}${map}/player.json`
  const rec = await io.json(recordKey)
  if (rec == null) return { current: false, status: 404, why: `"${map}" names no player — nothing at ${recordKey}. There is no default player. ▶ node scripts/set-staging-player.mjs --map=${map} --player=ward` }
  if (rec.player === 'legacy') return { current: false, status: 500, why: `"${map}"'s record (${recordKey}) names the retired player (legacy). Every town plays the Ward. ▶ node scripts/set-staging-player.mjs --map=${map} --player=ward` }
  if (rec.player !== 'ward') return { current: false, status: 500, why: `${recordKey} names player ${JSON.stringify(rec.player)}; a town's player is "ward".` }
  const pointerKey = `${WARD_PREFIX}current.json`
  const cur = await io.json(pointerKey)
  if (cur == null) return { current: false, status: 404, why: `the Ward is not published — nothing at ${pointerKey}. ▶ theward: npm run publish:staging` }
  if (!isSha(cur.sha) || !isSha(cur.kit)) return { current: false, status: 500, why: `${pointerKey} must name a Ward commit ("sha") and the kit commit it was built against ("kit"); it says ${JSON.stringify(cur)}.` }
  const bundleKey = `${KIT_PREFIX}${cur.kit}/manifest.json`
  if (!(await io.exists(bundleKey))) return { current: false, status: 404, why: `the kit bundle for ${cur.kit} is not published — nothing at ${bundleKey}. ▶ node scripts/publish-kit-bundle.mjs --sha=${cur.kit}` }
  const docKey = `${WARD_PREFIX}${cur.sha}/index.html`
  if (!(await io.exists(docKey))) return { current: false, status: 404, why: `the Ward build ${cur.sha} has no index.html, though ${pointerKey} points at it.` }
  return { current: true, ward: cur.sha, kit: cur.kit }
}
