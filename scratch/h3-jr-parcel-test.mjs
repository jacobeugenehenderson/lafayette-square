// READ-ONLY probe (H-3, 2026-09-23; Jacob: "measure parcels"). For every frozen tile whose ring passes within 1 m of an
// AT-GRADE ramp terminal, compares the two FRONTAGE tests side by side:
//   BUILDINGS = raw intake footprint centroids inside (raw/msbf.json — the RAW set, never the shown/member set)
//   PARCELS   = share of the face covered by cadastral parcels (grid-sampled at ~150 pts), + parcel centroids inside
// "No parcel → road land" would make a face JR when parcel coverage is ~0. ⛔ Prints coverage, not a verdict:
// no cutoff is proposed here (a coverage cutoff would be an unexplained constant — Layer 0).
import fs from 'node:fs'
const PARCELS = { 'lafayette-square': 'stl_parcels.json', huron: 'oh_parcels.json' }
const towns = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PARCELS)
const pip = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const A = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a / 2) }
for (const t of towns) {
  const skP = `cartograph/data/${t}/clean/skeleton.json`, shP = `public/baked/${t}/shape.json`, paP = `cartograph/data/${t}/raw/${PARCELS[t]}`
  const sk = JSON.parse(fs.readFileSync(skP)).streets, sh = JSON.parse(fs.readFileSync(shP)), parcels = JSON.parse(fs.readFileSync(paP)).parcels
  const K = p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`, town = new Set(), term = []
  for (const s of sk) if (!s.gradeSeparated) for (const p of s.points) town.add(K(p))
  for (const s of sk) if (s.gradeSeparated) for (const p of [s.points[0], s.points.at(-1)]) if (town.has(K(p))) term.push([p.x, p.z])
  const bld = JSON.parse(fs.readFileSync(`cartograph/data/${t}/raw/msbf.json`)).buildings.map(b => [b.coords.reduce((s, q) => s + q.x, 0) / b.coords.length, b.coords.reduce((s, q) => s + q.z, 0) / b.coords.length])
  const P = parcels.filter(p => p.rings?.[0]?.length >= 3).map(p => { const r = p.rings[0], xs = r.map(q => q[0]), zs = r.map(q => q[1]); return { r, c: p.centroid, bb: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] } })
  console.log(`${t} [skeleton ${fs.statSync(skP).mtime.toISOString()} · shape ${fs.statSync(shP).mtime.toISOString()} · parcels ${P.length}]`)
  sh.tiles.forEach((tl, i) => {
    const ring = Array.isArray(tl.ring?.[0]?.[0]) ? tl.ring[0] : tl.ring; if (!ring) return
    if (!term.some(q => ring.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1))) return
    const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]), bb = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]
    const cand = P.filter(p => p.bb[0] <= bb[2] && p.bb[2] >= bb[0] && p.bb[1] <= bb[3] && p.bb[3] >= bb[1])
    const step = Math.max(1, Math.sqrt(A(ring) / 150)); let n = 0, hit = 0
    for (let x = bb[0] + step / 2; x < bb[2]; x += step) for (let z = bb[1] + step / 2; z < bb[3]; z += step) { const q = [x, z]; if (!pip(q, ring)) continue; n++; if (cand.some(p => q[0] >= p.bb[0] && q[0] <= p.bb[2] && q[1] >= p.bb[1] && q[1] <= p.bb[3] && pip(q, p.r))) hit++ }
    const nb = bld.filter(b => pip(b, ring)).length, pc = cand.filter(p => pip(p.c, ring)).length
    console.log(`   tile ${i} @(${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0)},${(zs.reduce((a, b) => a + b, 0) / zs.length).toFixed(0)}) ${Math.round(A(ring))} m² · buildings ${nb} · parcel coverage ${n ? (100 * hit / n).toFixed(0) : '-'}% · parcel centroids ${pc} · lu ${tl.lu}`)
  })
}
