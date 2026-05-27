/**
 * skyMode — TEMPORARY stopgap switch (Howard, 2026-05-27).
 *
 * Selects which sky renderer the three production-facing surfaces
 * (production Scene, Cartograph Stage, Preview) mount:
 *   'cheap'      → restored procedural <CloudDome/>  (ships by default)
 *   'volumetric' → the Meteorologist <Atmosphere/> slab (under development)
 *
 * Why this exists: the volumetric per-genus cloud work (Howard's
 * morphology track) is a long runway. We ship the known-good cheap dome
 * now so the live map looks good, and keep the slab integration fully
 * intact behind this flag — nothing about <Atmosphere/>, the directive
 * driver, or slab-follows-cloud changes.
 *
 * Override: `?sky=volumetric` (or `?sky=cheap`) on any URL flips that
 * surface for a by-eye check without a rebuild. The default is the
 * deploy-level INSTANCE.skyMode.
 *
 * NOT a per-Look property: the sky renderer is global runtime, not a
 * neighborhood trait — see the 2026-05-27 cloud-stopgap discussion.
 *
 * CanaryScene (the Meteorologist authoring viewport) mounts <Atmosphere/>
 * directly and ignores this switch — it's where the volumetric work is
 * authored.
 *
 * Delete-on-landing: when the species are done, the volumetric path
 * becomes the only sky. Drop this module, collapse the three mounts back
 * to <Atmosphere/>, and remove CloudDome. No schema scars.
 */
import { INSTANCE } from '../instance.js'

function resolveSkyMode() {
  if (typeof window !== 'undefined') {
    try {
      const p = new URLSearchParams(window.location.search).get('sky')
      if (p === 'volumetric' || p === 'cheap') return p
    } catch { /* SSR / no location — fall through to deploy default */ }
  }
  return INSTANCE.skyMode === 'volumetric' ? 'volumetric' : 'cheap'
}

export const SKY_MODE = resolveSkyMode()
export const SKY_IS_VOLUMETRIC = SKY_MODE === 'volumetric'
