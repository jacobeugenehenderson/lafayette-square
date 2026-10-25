// ⭐ THE GEOGRAPHY A POUR READS — every town's own data/<scene>/geography.json, Lafayette Square included.
//
// config.js projects every metre from five numbers: lat, lon, bbox, lonToMeters, latToMeters. The pour's code record
// (`pour-code.mjs`) records THIS value (`map.json.geographyRead`). ⛔ There is no default town: Lafayette Square's used
// to come from its registry module as the default map's, and was measured identical to its geography.json on
// 2026-10-21 when the default went (BRIEF-no-default-town). ⛔ Nothing here imports `src/instances/`.
//    ▶ node checks/claims-the-bake-watches-its-code.mjs
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { mapDir } from './scene.js'

const pick = (g) => ({ lat: g.lat, lon: g.lon, bbox: g.bbox, lonToMeters: g.lonToMeters, latToMeters: g.latToMeters })

// → the five fields config.js reads for `scene`. ⛔ Throws, never falls back: an absent geography is unbuildable.
export function geographyFor(scene) {
  if (!scene) throw new Error('⛔ geographyFor: no scene named — there is no default town to project.')
  const p = join(mapDir(scene), 'geography.json')
  if (existsSync(p)) return pick(JSON.parse(readFileSync(p, 'utf8')))
  // ⛔ Was: warn + fall back to Lafayette Square's lat/lon. That projects another town at St. Louis's coordinates —
  // every metre of its geometry lands in the wrong place, plausibly, with only a console warning.
  throw new Error(`
⛔ scene '${scene}' has no geography.json (looked in ${p}).

   Refusing to fall back to another town's coordinates — every derived metre would be wrong.

   Create data/${scene}/geography.json (lat/lon/bbox) first.
`)
}
