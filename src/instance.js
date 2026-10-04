/**
 * INSTANCE — per-installation configuration, selected at boot by `?look=`.
 *
 * The runtime reads from this module instead of hardcoding LS-specific values;
 * a different installation (`?look=hipointedemun`) boots its own config. This
 * is the CONSUMER-face instance-boot of the two-faces frame
 * (`plans/front-front-end-and-productization.md §The two faces`): the app is a
 * generic reader; Lafayette Square is installation #1 (the default).
 *
 * SYNCHRONOUS by necessity: several consumers read INSTANCE at module load
 * (e.g. CourierDots `const CENTER_LAT = INSTANCE.geography.lat`), so the config
 * must resolve synchronously here — no async boot. Per-look configs are small
 * self-contained modules under `./instances/`, bundled + selected by the URL's
 * `?look=` param (available synchronously at module init). Authored identity
 * (sky, materials, palette, ...) still travels through the slab
 * (`slab-is-the-instance-identity`); THIS covers the fixed-truth identity the
 * slab doesn't carry: geography, id, branding, legal, commerce, profile, contact.
 *
 * The eventual 3rd-party path (fetch config from a remote payload) is the
 * deferred horizon; this selection swaps to it without touching consumers.
 * Doctrine: project_slab_is_the_instance_identity, project_kit_helpers_pattern.
 */
import { instanceForMap, registeredMaps, DEFAULT_MAP } from './instances/registry.js'
import { tenantOf } from './lib/townRecord.js'
// ⛔⛔ THE LOOK→MAP TABLE, STATICALLY — AND THIS IMPORT IS WHY `registry.js` EXISTS.
// It is the authoring index, bundled at BUILD time, which is the right currency
// here: the player ships with slabs baked at build time, so a Look the build never
// saw has no slab to render either. A fetch cannot serve it — INSTANCE must resolve
// SYNCHRONOUSLY (consumers read it at module load, e.g. `const CENTER_LAT =
// INSTANCE.geography.lat`).
// ⛔ BUT THE DEV SERVER REWRITES THIS FILE ON EVERY BAKE (`bakedAt`) AND ON EVERY
// look create / rename / delete, and `node --watch` watches a module graph. So any
// Node-side importer of THIS module kills itself mid-request whenever it saves the
// looks index — which is exactly what took down the pour on 2026-09-21
// (`src/instances/registry.js` has the full account). ⛔ Node-side code imports
// `./instances/registry.js`, never this file; the browser imports this one.
// ▶ node checks/claims-the-dev-servers-do-not-import-the-looks-index.mjs
import looksIndex from '../public/looks/index.json' with { type: 'json' }

// ⛔ The PLAYER's default look — what the BARE address shows, with no `?look=`. It is
// NOT `looksIndex.default`: that is the authoring 0-state (`kit-default`), an empty Look
// bound to no map with nothing baked, and defaulting a visitor to it would render
// nothing.
//
// ⭐ IT IS THE ANSWER FOR THE BUILD THAT OWNS THE BARE DOMAIN, and only that one. Every
// other town is addressed by PATH — see `readLookParam` below.
const DEFAULT_LOOK = 'lafayette-square'

/**
 * Which look this page is. `?look=` wins; otherwise the FIRST PATH SEGMENT, if it names a
 * look we know; otherwise the bare-domain default.
 *
 * ⭐⭐ THE PATH IS HOW A TOWN IS ADDRESSED, AND IT IS WHY THERE IS ONE BUILD RATHER THAN N
 * (2026-09-21). The Ward is the UNIVERSAL PLAYER and a town is a slab instantiated inside
 * it (`project_the_ward_is_the_player_not_the_neighborhood`), so compiling the player once
 * per town is a category error — it makes ten builds of the thing whose whole definition is
 * being one thing. `staging.theward.online/<map>/` therefore serves the SAME bytes for every
 * town and reads the town off its own URL.
 * ⛔ This replaced a `VITE_DEFAULT_LOOK` baked in at build time (H-18 ②), which worked and
 * was the wrong shape: it put the town in the bundle, so pouring town #10 meant a build and
 * an upload. Nothing per-town is compiled now.
 *
 * ⛔ THE SEGMENT IS VALIDATED AGAINST THE LOOKS INDEX, NEVER TRUSTED. An unknown segment is
 * NOT a look — it is a deep link into the SPA (`/legal`, `/preview`) — and treating it as a
 * town would resolve every route to a missing installation and fall back loudly for no
 * reason. ⭐ Validating also means this needs no list of towns and no edit per pour.
 *
 * ⭐⭐ A PRODUCTION HOST NAMES ITS TOWN, AND NOTHING ON THE URL MAY OVERRIDE IT (2026-09-26).
 * `provincetown.online/` has no path segment, so without this it would take the bare-domain
 * default and draw Lafayette Square. The production Worker resolves the town from the HOST
 * and writes it into `<meta name="ward-look">`; it wins over `?look=` because a town's own
 * domain showing another town (`provincetown.online/?look=huron`) is the bleed Layer 0 q2
 * forbids, reached by a query string.
 */
function readLookParam() {
  try {
    const host = document.querySelector('meta[name="ward-look"]')?.getAttribute('content')
    if (host) return host
    const q = new URLSearchParams(window.location.search).get('look')
    if (q) return q
    // ⭐ THE AUTHORING APP STARTS AS THE TOWN YOU LAST HAD OPEN (Jacob, 2026-09-26: "Stage
    // Must Not Start Up As Lafayette Square"). cartograph.html names the key its store
    // persists the active Look under. Without this every module that reads INSTANCE at load
    // (the sun's latitude/longitude, the sky grid, the terrain's exaggeration) took LS's
    // values in every town's Stage. Only a Look with a map counts.
    const authoringKey = document.querySelector('meta[name="ward-authoring"]')?.getAttribute('content')
    if (authoringKey) {
      // ⭐ AN AUTHORING PAGE'S INSTANCE IS THE TOWN IT OPENS, OR NONE (BRIEF-no-default-town, 2026-09-28). ?scene= names
      // the town the store opens, so it names INSTANCE too — Stage opened by ?scene=huron kept Lafayette Square's
      // INSTANCE and drew huron with LS's listings. Nothing named, nothing stored: NO town (the Look picker offers them);
      // it used to start as Lafayette Square.
      const towns = (looksIndex.looks || []).filter(l => l.scene)
      const stored = localStorage.getItem(authoringKey)
      const scene = new URLSearchParams(window.location.search).get('scene')
      if (scene) {
        const own = towns.filter(l => l.scene === scene)
        const pick = own.find(l => l.id === stored) || own[0]
        if (pick) return pick.id
        console.error(`[instance] ⛔ ?scene=${scene} names no town's Look — no town is opened`)
        return null
      }
      if (stored && towns.some(l => l.id === stored)) return stored
      console.warn(`[instance] the authoring app has no town open (localStorage '${authoringKey}' is ${stored ? `"${stored}", not a town` : 'empty'}) — choose one`)
      return null
    }
    const seg = window.location.pathname.split('/').filter(Boolean)[0]
    if (seg && (looksIndex.looks || []).some(l => l.id === seg)) return seg
    return DEFAULT_LOOK
  } catch {
    // Non-browser importers (node scripts, tests) have no `window`.
    return DEFAULT_LOOK
  }
}

/**
 * The town's own PATH PREFIX on this site — `/huron` on `staging.theward.online/huron/…`, `''` on a
 * town's own domain and in dev. ⭐ The same rule `readLookParam` uses (a first segment that names a
 * look), read separately because `?look=` or the host tag can pick the look while the town segment
 * is still on the path. ⛔ Routes are matched AFTER it (`App.jsx#parseRoute`), which is why
 * `/huron/link/<token>` is the link page and not an unknown path.
 */
export const TOWN_PATH_PREFIX = (() => {
  try {
    const seg = window.location.pathname.split('/').filter(Boolean)[0]
    return seg && (looksIndex.looks || []).some(l => l.id === seg) ? `/${seg}` : ''
  } catch { return '' }
})()

/**
 * THE MAP A LOOK IS A LOOK OF — the one client-side home for this rule.
 *
 * The server already has it (`cartograph/tree-bake-inputs.mjs#mapForLook`); the
 * client had it copied inline in `Grove.jsx` as `l.scene || l.id`. Arborist and
 * Meteorologist both send look-keyed packets (`?look=`, `/looks/<id>/trees`) and
 * resolve the map at the far end, so they should import THIS rather than keep
 * their own copy.
 *
 * ⛔ `entry.scene` is the map id. A Look with no entry is not "probably its own
 * map" — it is a Look we cannot place, and null says so.
 */
export function mapForLook(lookId) {
  const entry = (looksIndex.looks || []).find(l => l.id === lookId)
  if (!entry) return null
  return entry.scene || null
}

// Two cases, two rulings.
// ① A Look NOT IN THE INDEX (`?look=<unregistered>`) resolves to the default town, loudly — ROADMAP A12, ruled closed
//   as accepted behaviour (Jacob, 2026-09-20). It keeps the ASKED-FOR `lookId` and is marked `identityResolved: false`,
//   so it has no backend tenant (`townTenant` throws): it may draw LS, it may never write LS's rows.
// ② ⛔ A REGISTERED Look whose MAP HAS NO MODULE never wears another town's identity (Jacob, 2026-10-04). That is a
//   real town poured without its identity (altadena), and dressing it as LS — name, geography, legal jurisdiction — is
//   the inheritance the spec forbids. An authoring page (`<meta name="ward-authoring">`: Designer, Stage, Preview) opens
//   with NO town and says why, so the operator can still switch; any other page throws at boot.
const AUTHORING_PAGE = (() => { try { return !!document.querySelector('meta[name="ward-authoring"]') } catch { return false } })()

function resolveInstance() {
  const lookId = readLookParam()
  if (lookId === null) return null   // an authoring page with no town open — no identity is guessed
  const mapId = mapForLook(lookId)
  if (!mapId) {
    console.error(
      `[instance] Look "${lookId}" is not in public/looks/index.json, so there is no ` +
      `map to resolve its identity from. Falling back to "${DEFAULT_MAP}" (ROADMAP A12) — this page has no backend tenant.`)
    return { ...instanceForMap(DEFAULT_MAP), lookId, mapId: DEFAULT_MAP, identityResolved: false }
  }
  const town = instanceForMap(mapId)
  // ⛔ `lookId` last: it OVERRIDES the module's own literal, which names the map.
  if (town) return { ...town, lookId, mapId, identityResolved: true }
  const msg = `[instance] ⛔ map "${mapId}" (look "${lookId}") has no installation module — src/instances/${mapId}.js ` +
    `is not registered (registry has: ${registeredMaps().join(', ')}). This page has NO town identity; it will not borrow ` +
    `another town's. ▶ node cartograph/scaffold-instance.mjs --scene=${mapId}, then register it in src/instances/registry.js.`
  if (AUTHORING_PAGE) { console.error(msg); return null }
  throw new Error(msg)
}

export const INSTANCE = resolveInstance()

/**
 * The town's backend key: its sealed opaque id (`cartograph/data/<map>/town-id.json`, attached by the registry).
 * One reader, shared with the Ward (`src/lib/townRecord.js#tenantOf`). ⛔ A page with no town, or one wearing the default
 * town (A12), has no tenant: it throws.
 */
export function townTenant() {
  if (INSTANCE && !INSTANCE.identityResolved) throw new Error(`[instance] look "${INSTANCE.lookId}" is wearing the default town (ROADMAP A12), so it has no backend tenant — refusing to call the backend as another town.`)
  return tenantOf(INSTANCE, INSTANCE ? `look "${INSTANCE.lookId}"` : 'this page (no town open)')
}

/**
 * The town a Look belongs to — its instance module, carrying that Look's id and map. Stage switches
 * towns live, so a renderer drawing a town it was GIVEN asks this rather than reading INSTANCE (the
 * page's boot town). null for a Look we cannot place.
 */
/** The set-piece a Look's town declares, or null — for panels that show its controls only where it exists. */
export function setPieceOf(lookId) { return townForLook(lookId)?.setPiece ?? null }

export function townForLook(lookId, where = 'a caller') {
  // ⛔ No Look ⇒ no town. This used to answer the BOOT town for a null Look (Stage drew it under no Look).
  if (!lookId) throw new Error(`[instance] ⛔ townForLook(${lookId}) from ${where} — no Look, no town; pass the Look being drawn`)
  if (INSTANCE && lookId === INSTANCE.lookId) return INSTANCE
  const map = mapForLook(lookId)
  const town = map && instanceForMap(map)
  return town ? { ...town, lookId, mapId: map } : null
}

/**
 * ⭐ THE PUBLIC-FACING CONTACT FIELDS, CHECKED OUT LOUD.
 *
 * These reach `LegalPage.jsx` — the canonical public statement, and the only
 * page that is NOT module-gated, so EVERY installation shows it. On the three
 * towns that are not Lafayette Square they are all explicitly `null`.
 *
 * ⛔ AND `null` IS NOT NOTHING — it RENDERS. `mailto:${INSTANCE.contact.email}`
 * with a null value produces the literal string "mailto:null": a dead link, no
 * error, no console line, on the one page that is supposed to be stable. A
 * sentinel is not a value; the consumer prints whatever it is handed.
 *
 * ⭐ Silent, and worst on the towns nobody has looked at — which is the kit's
 * signature failure shape. So it says so, once, at boot, naming the town and the
 * key. ⛔ It does NOT throw: a blank app is a worse answer than a legal page with
 * a labelled gap, and the same reasoning is why resolveInstance above falls back
 * loudly rather than dying. Loud, not fatal.
 */
const PUBLIC_CONTACT_FIELDS = [
  ['contact.email',   (i) => i?.contact?.email],
  ['cary.email',      (i) => i?.cary?.email],
  ['cary.smsNumber',  (i) => i?.cary?.smsNumber],
]
if (INSTANCE) {
  const missing = PUBLIC_CONTACT_FIELDS.filter(([, read]) => !read(INSTANCE)).map(([k]) => k)
  if (missing.length) {
    console.error(
      `[instance] "${INSTANCE.mapId || 'unknown'}" has no ${missing.join(', ')}. ` +
      `These are PUBLIC — they render on the legal page, which every installation ` +
      `shows and which no module flag gates. Unset, the page shows a labelled gap ` +
      `instead of a contact; before this check it rendered a dead "mailto:null" ` +
      `link with nothing said. Set them in src/instances/${INSTANCE.mapId || '<map>'}.js ` +
      `before this town is shown to anyone.`)
  }
}

/**
 * Module presence for mount-gating. ⭐ DEFAULT-ON — OPT-OUT, not opt-in
 * (kit procedure, Jacob 2026-07-19). The kit activates the ENTIRE player by
 * default; an installation declares a module `false` (or delivery
 * `{ enabled:false }`) ONLY to DELIBERATELY opt out. Rationale: toggling a
 * feature OFF silently cancels it — you forget it exists (the vanished
 * ticker/tabs). An absent module renders its EMPTY state (a visible to-do),
 * never a missing tab (invisible debt). CONTRACT: an activated feature with
 * empty assets must degrade to an empty state, NEVER crash (empty-asset
 * robustness). `delivery` carries a nested `{ enabled, ... }`; the rest are
 * plain booleans. LS (all-on) + HPDM (explicit) are unchanged.
 */
export function moduleOn(name) {
  const m = INSTANCE.modules?.[name]
  if (m == null) return true                                    // absent → ON (default full activation)
  return (typeof m === 'object') ? m.enabled !== false : m !== false
}
