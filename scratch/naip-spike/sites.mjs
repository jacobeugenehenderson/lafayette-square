// Locate the at-grade ramp ends from the skeleton: grade-separated chain endpoints that
// share a vertex (≤0.05 m) with a non-grade-separated street. Frame → lat/lon via
// geography.json's own origin + metre factors (+x=E, +z=S), as bake-landscape.js reads it.
import { readFileSync, statSync, writeFileSync } from 'fs'
const scene = process.argv[2] || 'lafayette-square'
const skP = `cartograph/data/${scene}/clean/skeleton.json`, geoP = `cartograph/data/${scene}/geography.json`
const sk = JSON.parse(readFileSync(skP, 'utf8')), geo = JSON.parse(readFileSync(geoP, 'utf8'))
console.log(`skeleton ${skP} mtime ${statSync(skP).mtime.toISOString()}`)
const toLL = p => ({ lat: geo.lat - p.z / geo.latToMeters, lon: geo.lon + p.x / geo.lonToMeters })
const gs = sk.streets.filter(s => s.gradeSeparated), at = sk.streets.filter(s => !s.gradeSeparated)
const ends = []
for (const g of gs) for (const e of [g.points[0], g.points.at(-1)]) {
  const hits = at.filter(s => s.points.some(p => Math.hypot(p.x - e.x, p.z - e.z) < 0.05))
  if (hits.length) ends.push({ ramp: g.id, x: e.x, z: e.z, ...toLL(e), streets: [...new Set(hits.map(h => h.name))] })
}
// dedupe by vertex
const uniq = []; for (const e of ends) { const u = uniq.find(q => Math.hypot(q.x - e.x, q.z - e.z) < 0.05); if (u) { u.ramp += ',' + e.ramp } else uniq.push(e) }
for (const e of uniq) console.log(`${e.ramp.padEnd(40)} (${e.x.toFixed(1)}, ${e.z.toFixed(1)})  ${e.lat.toFixed(6)}, ${e.lon.toFixed(6)}  ↔ ${e.streets.join(' / ')}`)
writeFileSync('scratch/naip-spike/ramp-ends.json', JSON.stringify(uniq, null, 1))
