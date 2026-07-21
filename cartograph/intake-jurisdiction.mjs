/**
 * intake-jurisdiction.mjs — WHICH PLACE a scene belongs to, for source sharing.
 *
 * ⭐ Jacob, 2026-07-20: *"When someone adds a resource for Łódź it should become
 * available for other hoods in Łódź… they need to have access to the same list
 * of options (including their native best)."*
 *
 * The insight the catalogue had not drawn out: an acquisition well is a
 * property of the JURISDICTION, not the neighbourhood. A municipal tree
 * inventory, an assessor endpoint, a national heritage register — every one of
 * them is true for the whole city or the whole country. Księży Młyn and Centrum
 * are both Łódź; a source found while pouring one is simply a fact about Łódź,
 * and making the second operator rediscover it is the exact per-session
 * re-derivation this manifest exists to end (`BRIEF §1`).
 *
 * ⛔ DERIVED FROM COORDINATES, NEVER FROM THE STORED TIMEZONE.
 * `data/ksi-y-m-yn/geography.json` carries `timezone: "America/Chicago"` for a
 * neighbourhood in Poland — a stale artifact of the first non-US pour (Centrum,
 * poured later, is correctly `Europe/Warsaw`). Keying on the stored field would
 * file Księży Młyn under St. Louis and hand it US sources as its "native best",
 * which is precisely the inversion this feature exists to prevent. Coordinates
 * cannot drift the way a copied field can, so they are the key.
 * ⚠️ The stored timezone is wrong on disk and should be corrected separately —
 * it also feeds the sky. Tracked, not fixed here.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import tzLookup from 'tz-lookup'
import { sceneDir } from './config.js'

/**
 * Coarse regional bucket. This is what decides which source is a scene's
 * NATIVE BEST — `INTAKE-CATALOGUE §5.1`: Microsoft's ML footprints are correct
 * in St. Louis and actively worse in Łódź, where hand-mapped OSM carries ~2×
 * the vertex detail. Region is the axis that ordering reads.
 */
export function regionForTz(tz) {
  if (!tz) return 'global'
  if (tz.startsWith('America/')) return 'us'
  if (tz.startsWith('Europe/')) return 'eu'
  return 'global'
}

/**
 * The sharing key. Timezone zone-name doubles as a serviceable jurisdiction
 * proxy — `Europe/Warsaw` is Poland, `America/Chicago` is the central US — and
 * it needs no network, which matters for a kit whose whole doctrine is that a
 * pour works with the cable pulled (`BRIEF §4`).
 *
 * ⚠️ It is a PROXY, deliberately coarse. `America/Chicago` spans far more than
 * St. Louis, so a source shared under it may not apply to every hood beneath
 * it. That is the right failure direction — an operator shown one extra
 * candidate loses a moment; an operator shown none rediscovers it from scratch.
 * A true city/country key wants the geocoder's own administrative fields
 * recorded at Extent-commit time; that is the upgrade, not this.
 */
export function jurisdictionForScene(scene) {
  const p = join(sceneDir(scene), 'geography.json')
  if (!existsSync(p)) return null
  try {
    const g = JSON.parse(readFileSync(p, 'utf8'))
    if (typeof g.lat !== 'number' || typeof g.lon !== 'number') return null
    const tz = tzLookup(g.lat, g.lon)
    return { key: tz, region: regionForTz(tz), lat: g.lat, lon: g.lon }
  } catch {
    return null
  }
}
