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
import lafayetteSquare from './instances/lafayette-square.js'
import hipointeDemun from './instances/hipointe-demun.js'
import ksiezyMlyn from './instances/ksi-y-m-yn.js'
import centrum from './instances/centrum.js'

const INSTANCES = {
  'lafayette-square': lafayetteSquare,
  'hipointe-demun': hipointeDemun,
  'ksi-y-m-yn': ksiezyMlyn,
  centrum,
}

const DEFAULT_LOOK = 'lafayette-square'

// Resolve the active installation from `?look=`. Guarded so non-browser importers
// (node scripts, tests) fall back to the default rather than throw on `window`.
function resolveLookId() {
  try {
    return new URLSearchParams(window.location.search).get('look') || DEFAULT_LOOK
  } catch {
    return DEFAULT_LOOK
  }
}

// ⭐ An UNKNOWN look must announce itself, not quietly become Lafayette Square.
//
// This was a bare `INSTANCES[resolveLookId()] || INSTANCES[DEFAULT_LOOK]`, so
// `?look=provincetown` — a real poured slab with no instance file — rendered
// that town's geometry wearing LS's name, geography, park label, tax rate and
// legal jurisdiction, with NO warning anywhere. That is exactly what happened
// before `instances/ksi-y-m-yn.js` was written; its header records it.
//
// We still fall back (a blank screen would be worse), but loudly, and the
// fallback is now legible in the console instead of invisible. No behaviour
// change for a registered look. (`BRIEF-ls-bleed-excision.md` site 5.)
function resolveInstance() {
  const id = resolveLookId()
  const hit = INSTANCES[id]
  if (hit) return hit
  console.error(
    `[instance] Unknown installation "${id}" — no src/instances/${id}.js is registered. ` +
    `Falling back to "${DEFAULT_LOOK}", so THIS PAGE IS NOW WEARING ANOTHER TOWN'S ` +
    `identity, geography and legal jurisdiction. Register the installation before ` +
    `shipping it.`)
  return INSTANCES[DEFAULT_LOOK]
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
      `[instance] "${INSTANCE.id || 'unknown'}" has no ${missing.join(', ')}. ` +
      `These are PUBLIC — they render on the legal page, which every installation ` +
      `shows and which no module flag gates. Unset, the page shows a labelled gap ` +
      `instead of a contact; before this check it rendered a dead "mailto:null" ` +
      `link with nothing said. Set them in src/instances/${INSTANCE.id || '<look>'}.js ` +
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
