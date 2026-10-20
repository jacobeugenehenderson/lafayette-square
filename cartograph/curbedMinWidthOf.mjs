// The minimum curbed width (where a curbed feature ends — the nose), read from the registry by finding id for the town's
// state (`curbedMinWidth`, streetProfiles.js). ⭐ ONE function, every caller: the bake (bake-ground.js) and Survey's live
// build (serve.js `GET /<scene>/curbed-min-width`), so the two cannot read it from different places.
// ⛔ No scene or no raw OSM ⇒ the state is unknown, and the label says so. A registry without the finding throws.
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mapRawDir } from './scene.js'
import { curbedMinWidth, townState } from '../src/cartograph/streetProfiles.js'

export const REGISTRY_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'references', 'registry.json')

export function curbedMinWidthOf(scene, read = null) {
  const osmP = scene && join(mapRawDir(scene), 'osm.json')
  const state = osmP && existsSync(osmP) ? townState(JSON.parse(readFileSync(osmP, 'utf8'))) : { code: null }
  return curbedMinWidth(JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')), state, read)
}
