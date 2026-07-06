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

const INSTANCES = {
  'lafayette-square': lafayetteSquare,
  'hipointe-demun': hipointeDemun,
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
