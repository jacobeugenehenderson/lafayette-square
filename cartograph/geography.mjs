// ⭐ THE GEOGRAPHY A POUR READS — the one place the pour touches the town modules (`src/instances/*`).
//
// config.js projects every metre from five numbers: lat, lon, bbox, lonToMeters, latToMeters. A non-default scene
// takes them from its own data/<scene>/geography.json; the default map from its registry module's `.geography`.
// Those modules also carry favicons, domains, share cards and set-pieces the pour never reads — so the pour's code
// record (`pour-code.mjs`) does NOT hash them as files: it stops at the registry and records THIS value instead
// (`map.json.geographyRead`), exactly as `registryRead` records the registry entries a pour used.
// ⛔ This must stay the ONLY file in the pour's import closure that imports from `src/instances/`.
//    ▶ node checks/claims-the-bake-watches-its-code.mjs
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { instanceForMap } from '../src/instances/registry.js'
import { DEFAULT_MAP, mapDir } from './scene.js'

const pick = (g) => ({ lat: g.lat, lon: g.lon, bbox: g.bbox, lonToMeters: g.lonToMeters, latToMeters: g.latToMeters })

// → the five fields config.js reads for `scene`. ⛔ Throws, never falls back: an absent geography is unbuildable.
export function geographyFor(scene) {
  if (scene !== DEFAULT_MAP) {
    const p = join(mapDir(scene), 'geography.json')
    if (existsSync(p)) return pick(JSON.parse(readFileSync(p, 'utf8')))
    // ⛔ Was: warn + fall back to instance.js (Lafayette Square's lat/lon). That
    // projects another town at St. Louis's coordinates — every metre of its
    // geometry lands in the wrong place, plausibly, with only a console warning.
    // An absent geography is not a degraded state, it is an unbuildable one.
    throw new Error(`
⛔ scene '${scene}' has no geography.json (looked in ${p}).

   Refusing to fall back to Lafayette Square's coordinates — that would project
   this town at St. Louis's lat/lon and every derived metre would be wrong.

   Create data/${scene}/geography.json (lat/lon/bbox) first.
`)
  }
  // ⛔ An unregistered default map is unbuildable, not degraded.
  const town = instanceForMap(DEFAULT_MAP)
  if (!town?.geography) throw new Error(`
⛔ the default map '${DEFAULT_MAP}' has no registered instance module (looked in
   src/instances/registry.js), so there is no geography to project from.

   Register src/instances/${DEFAULT_MAP}.js before building.
`)
  return pick(town.geography)
}
