/**
 * INSTANCE — per-installation configuration, selected at boot by `?look=`.
 *
 * The runtime reads from this module instead of hardcoding LS-specific values;
 * a different installation (`?look=hipointe-demun`) boots its own config. This
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
// nothing. (`DEFAULT_MAP` is the registry's, imported above — one constant, one home.)
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
 */
function readLookParam() {
  try {
    const q = new URLSearchParams(window.location.search).get('look')
    if (q) return q
    const seg = window.location.pathname.split('/').filter(Boolean)[0]
    if (seg && (looksIndex.looks || []).some(l => l.id === seg)) return seg
    return DEFAULT_LOOK
  } catch {
    // Non-browser importers (node scripts, tests) have no `window`.
    return DEFAULT_LOOK
  }
}

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

// ⭐ An UNKNOWN look must announce itself, not quietly become Lafayette Square.
//
// This was a bare `INSTANCES[resolveLookId()] || INSTANCES[DEFAULT_LOOK]`, so
// `?look=provincetown` — a real poured slab with no instance file — rendered
// that town's geometry wearing LS's name, geography, park label, tax rate and
// legal jurisdiction, with NO warning anywhere.
//
// We still fall back (a blank screen would be worse), but loudly, and the
// fallback is legible in the console instead of invisible.
// ⚠️ ROADMAP A12 asks for MORE than loud — "an unregistered look must fail
// loudly, not draw the mould." A refusal need not be a blank screen (an explicit
// "this installation is not configured" state would satisfy both), but that is a
// product decision and is NOT taken here. Flagged, not decided.
//
// ⭐ WHAT DID CHANGE: `lookId` is now the look that was ASKED FOR, not the
// fallback town's own id. The slab pointer and the town identity are two
// different questions and this used to answer both with "lafayette-square".
function resolveInstance() {
  const lookId = readLookParam()
  const mapId = mapForLook(lookId)
  if (!mapId) {
    console.error(
      `[instance] Look "${lookId}" is not in public/looks/index.json, so there is no ` +
      `map to resolve its identity from. Falling back to "${DEFAULT_MAP}" — THIS PAGE ` +
      `IS NOW WEARING ANOTHER TOWN'S identity, geography and legal jurisdiction.`)
    return { ...instanceForMap(DEFAULT_MAP), lookId, mapId: DEFAULT_MAP, identityResolved: false }
  }
  const town = instanceForMap(mapId)
  if (!town) {
    console.error(
      `[instance] No installation module for map "${mapId}" (look "${lookId}") — ` +
      `src/instances/${mapId}.js is not registered (registry has: ` +
      `${registeredMaps().join(', ')}). Falling back to "${DEFAULT_MAP}", so ` +
      `THIS PAGE IS NOW WEARING ANOTHER TOWN'S identity, geography and legal ` +
      `jurisdiction. Register the map before shipping it.`)
    return { ...instanceForMap(DEFAULT_MAP), lookId, mapId, identityResolved: false }
  }
  // ⛔ `lookId` last: it OVERRIDES the module's own literal, which names the map.
  return { ...town, lookId, mapId, identityResolved: true }
}

export const INSTANCE = resolveInstance()

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
{
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
