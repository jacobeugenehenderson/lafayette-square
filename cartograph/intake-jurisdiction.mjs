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
import { mapDir } from './config.js'

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
 * The country is not guessed from it: that is the town's own jurisdiction.json
 * (cartograph/fetch-jurisdiction.mjs), carried alongside the key.
 */
export function jurisdictionForMap(scene) {
  const p = join(mapDir(scene), 'geography.json')
  if (!existsSync(p)) return null
  try {
    const g = JSON.parse(readFileSync(p, 'utf8'))
    if (typeof g.lat !== 'number' || typeof g.lon !== 'number') return null
    const tz = tzLookup(g.lat, g.lon)
    // The town's country + first-level subdivision — its own intake fact (cartograph/fetch-jurisdiction.mjs), which
    // decides which sources are ITS sources (src/cartograph/sourcesCatalogue.js resolveRow). null when not yet
    // fetched: the panel then says the country is unknown, never guesses it from the timezone.
    const jp = join(mapDir(scene), 'jurisdiction.json')
    const own = existsSync(jp) ? JSON.parse(readFileSync(jp, 'utf8')) : null
    return { key: tz, country: own?.country ?? null, subdivision: own?.subdivision ?? null, lat: g.lat, lon: g.lon }
  } catch {
    return null
  }
}
