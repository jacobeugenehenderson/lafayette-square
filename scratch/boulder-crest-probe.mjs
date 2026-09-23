// boulder-crest-probe.mjs — IS THE CREST BEING READ WHERE THE WALL ACTUALLY STANDS?
//
// ⛔⛔ bake-revetment.js:167 reads `const crest = heightAt(x, z)` — the terrain AT the
// shoreline station. The harness that proved this geometry reads 6 m LANDWARD, and says
// why in one line: "A shoreline arc sits AT the water, so the terrain ON it is ~0 by
// construction; the wall is what stands behind it." (huron.js CREST_PROBE_M).
// ⇒ If that is right, the bake samples the one place guaranteed to read ~0, and every
// crest is systematically too low. This measures it rather than arguing it.
// Read-only. ▶ node scratch/boulder-crest-probe.mjs [probeM]
import { readFileSync } from 'node:fs'
import { revetmentFaces } from '../src/lib/revetmentFromSlab.js'
import { shoreArmourFor, MIN_ARMOUR_D50_M } from '../cartograph/shore-armour.mjs'

const doc = JSON.parse(readFileSync('public/baked/huron/revetment.json', 'utf8'))
const osm = JSON.parse(readFileSync('cartograph/data/huron/raw/osm.json', 'utf8'))
const tm = JSON.parse(readFileSync('cartograph/data/huron/clean/terrain.json', 'utf8'))
const tb = readFileSync('cartograph/data/huron/clean/terrain.bin')
const tf = new Float32Array(tb.buffer, tb.byteOffset, tb.length / 4)
const stepX = (tm.bounds.maxX - tm.bounds.minX) / (tm.width - 1)
const stepZ = (tm.bounds.maxZ - tm.bounds.minZ) / (tm.height - 1)
const gridM = Math.min(stepX, stepZ)
const heightAt = (x, z) => {
  const gx = Math.round((x - tm.bounds.minX) / stepX), gz = Math.round((z - tm.bounds.minZ) / stepZ)
  if (gx < 0 || gz < 0 || gx >= tm.width || gz >= tm.height) return NaN
  const v = tf[gz * tm.width + gx]
  return Number.isFinite(v) ? v : NaN
}
const PROBE = Number(process.argv[2] ?? (gridM * 1.2))
const armourAt = shoreArmourFor(osm.ground || {})
console.log(`terrain grid step ${gridM.toFixed(3)} m · landward probe ${PROBE.toFixed(2)} m\n`)

let n = 0, armAt = 0, armLand = 0
const atH = [], landH = []
for (const f of revetmentFaces(doc)) {
  const p = f.poly
  for (let i = 1; i < p.length - 1; i++) {
    const ux = p[i+1].x - p[i-1].x, uz = p[i+1].z - p[i-1].z
    const m = Math.hypot(ux, uz); if (!m) continue
    // BUILD_SIDE is left = (uz,-ux) and that is the WATER. Landward is the negative.
    const nx = uz / m, nz = -ux / m
    const hAt = heightAt(p[i].x, p[i].z)
    const hLand = heightAt(p[i].x - nx * PROBE, p[i].z - nz * PROBE)
    if (!Number.isFinite(hAt) || !Number.isFinite(hLand)) continue
    n++; atH.push(hAt); landH.push(Math.max(0, hLand))
    if (armourAt(p[i].x, p[i].z, hAt).armour) armAt++
    if (armourAt(p[i].x, p[i].z, Math.max(0, hLand)).armour) armLand++
  }
}
const q = (a, t) => { a = [...a].sort((x, y) => x - y); return a[Math.min(a.length-1, Math.floor(t*a.length))] }
console.log('crest read AT the station   : median ' + q(atH,0.5).toFixed(3) + ' m · p90 ' + q(atH,0.9).toFixed(3))
console.log('crest read LANDWARD         : median ' + q(landH,0.5).toFixed(3) + ' m · p90 ' + q(landH,0.9).toFixed(3))
console.log()
console.log(`stations judged ARMOUR, crest AT station : ${armAt} / ${n} (${(100*armAt/n).toFixed(1)}%)`)
console.log(`stations judged ARMOUR, crest LANDWARD   : ${armLand} / ${n} (${(100*armLand/n).toFixed(1)}%)`)
console.log(`\nthreshold MIN_ARMOUR_D50_M = ${MIN_ARMOUR_D50_M} m`)
