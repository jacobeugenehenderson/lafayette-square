// Read-only helper (Keel, 2026-09-23). Rebuilds EXACTLY the bare rings bake-ground.js injects into
// byMaterial from map.json — by lifting the code out of bake-ground.js's SOURCE (polylineToRing,
// lateralOffset, POLYLINE_HALF_WIDTHS and the injection block), never by restating it.
import fs from 'fs'
const SRC = fs.readFileSync('cartograph/bake-ground.js', 'utf8')
const cut = (from, to) => { const a = SRC.indexOf(from); const b = SRC.indexOf(to, a + from.length); if (a < 0 || b < 0) throw new Error(`bake-ground.js no longer contains: ${a < 0 ? from : to}`); return SRC.slice(a, b) }
const HW = cut('const POLYLINE_HALF_WIDTHS = {', '\n}\n') + '\n}\n'
const P2R = cut('function polylineToRing(', '\n}\n') + '\n}\n'
const LAT = cut('function lateralOffset(', '\n}\n') + '\n}\n'
const INJ = cut('const mapLayers = mapData.layers || {}', '  // Re-clip to the stencil')
const build = new Function('mapData', 'byMaterial', `${HW}${P2R}${LAT}${INJ}; return byMaterial`)
export function overlayRings(mapData) { return build(mapData, new Map()) }
export { polylineToRingFromSource }
const polylineToRingFromSource = new Function(`${P2R}; return polylineToRing`)()
