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

const INSTANCES = {
  'lafayette-square': lafayetteSquare,
  'hipointe-demun': hipointeDemun,
  'ksi-y-m-yn': ksiezyMlyn,
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

export const INSTANCE = INSTANCES[resolveLookId()] || INSTANCES[DEFAULT_LOOK]

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
