#!/usr/bin/env node
// claims-the-road-lies-on-the-lattice.mjs — EVERY ROAD VERTEX IN THE DISC LIES IN A TILE OR AN INK PIECE (`roadOffTheLattice`).
//
// The ground takes a road's line from its owner, and only a tile edge (`ringOwner`) or an ink piece (`owners`) carries one
// (Boz's ruling, 2026-10-17: "the road is bounded by its GROUPS, not by space" — water and land use are not road). The bake
// refuses a vertex in neither; this reads the same function through the one feed, with the town's authoring and stencil:
//   asphalt + highway — the producer's own · stripe — `centreStripeRings` (bake-ground), ①'s line per eligible street.
// Reported, not gated (measured against ① for the next ruling): map.json's parkingLine and bikeLane, which bake-ground still
// offsets from the raw OSM way, and map.json's centerStripe, which the stripe no longer reads.
//   node checks/claims-the-road-lies-on-the-lattice.mjs [--scene=<town> …] [--selftest]
// --selftest: moves one stripe vertex 5 m off its line, in memory; the town must then go RED.
import fs from 'node:fs'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { roadOffTheLattice } from '../src/lib/tileGround.js'
import { centreStripeRings, polylineToRing, lateralOffset, POLYLINE_HALF_WIDTHS } from '../cartograph/bake-ground.js'

const SELFTEST = process.argv.includes('--selftest')
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const q = (xs) => { const s = [...xs].sort((a, b) => a - b), at = (u) => s[Math.min(s.length - 1, Math.floor(u * s.length))]
  return s.length ? `p50 ${at(0.5).toFixed(3)} · p90 ${at(0.9).toFixed(3)} · p99 ${at(0.99).toFixed(3)} · max ${Number.isFinite(s[s.length - 1]) ? s[s.length - 1].toFixed(2) : '> 100'} m` : '—' }
let bad = 0, towns = 0
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) { bad++; continue }
  const fp = f.ribbons.protopolygon
  if (!fp?.boundaryRing?.length) { console.log(`⛔ ${scene}: its frozen ① carries no boundaryRing — the disc is unknown, nothing was checked`); bad++; continue }
  const warn = console.warn; console.warn = () => {}
  let R; try { R = buildProto(f, { quiet: true, protoArtifact: true, protoProducer: true }) }
  catch (e) { console.warn = warn; console.log(`⛔ ${scene}: the producer refused, so nothing was checked — ${String(e.message).split('\n')[0].slice(0, 200)}`); bad++; continue }
  console.warn = warn
  if (!R.protoInkPieces?.length) { console.log(`⛔ ${scene}: the producer reported no ink pieces — nothing was checked`); bad++; continue }
  towns++
  const stripe = centreStripeRings(f.ribbons.streets).map(x => x.ring)
  if (SELFTEST && stripe.length) { const r = stripe[0], k = Math.floor(r.length / 4); r[k] = [r[k][0] + 5, r[k][1] + 5] }
  const off = roadOffTheLattice({ asphalt: R.asphalt, highway: R.highway || [], stripe }, R.protoShapeTiles, R.protoInkPieces, fp.boundaryRing)
  const ok = Object.values(off).every(o => !o.off.length)
  if (!ok) bad++
  console.log(`${ok ? '✅' : '⛔'} ${scene}: ${Object.entries(off).map(([g, o]) => `${g} ${o.n} vertices in the disc, in no tile and no piece ${o.off.length}${o.off.length ? ` (e.g. ${o.off.slice(0, 3).map(p => `(${p.map(c => c.toFixed(2))})`).join(' ')})` : ''}`).join(' · ')}`)
  // reported, not gated — the raw-OSM road paint, against ①'s ink (① is its line ± ε, so this is the paint's departure from ①)
  const C = 25, eg = new Map()
  R.proto.forEach((r) => r.forEach((a, k) => { const b = r[(k + 1) % r.length]
    for (let x = Math.floor(Math.min(a[0], b[0]) / C); x <= Math.floor(Math.max(a[0], b[0]) / C); x++) for (let z = Math.floor(Math.min(a[1], b[1]) / C); z <= Math.floor(Math.max(a[1], b[1]) / C); z++) (eg.get(x + ',' + z) || eg.set(x + ',' + z, []).get(x + ',' + z)).push([a, b]) }))
  const near = (p) => { for (let rad = 0; rad <= 4; rad++) { let d = Infinity; const cx = Math.floor(p[0] / C), cz = Math.floor(p[1] / C)
    for (let x = cx - rad; x <= cx + rad; x++) for (let z = cz - rad; z <= cz + rad; z++) for (const [a, b] of (eg.get(x + ',' + z) || [])) d = Math.min(d, sd(p, a, b))
    if (d <= rad * C) return d } return Infinity }
  const mp = `cartograph/data/${scene}/clean/map.json`, L = fs.existsSync(mp) ? (JSON.parse(fs.readFileSync(mp, 'utf8')).layers || {}) : null
  if (!L) { console.log(`   (no map.json — the raw-OSM road paint was not measured)`); continue }
  const lines = { 'centerStripe (map.json, no longer read)': (L.centerStripe || []).map(i => i.coords),
    'parkingLine (offset ±)': (L.parkingLine || []).filter(i => i.coords && i.offset).flatMap(i => [-1, 1].map(s => lateralOffset(i.coords, i.offset, s))),
    'bikeLane (offset ±)': (L.bikeLane || []).filter(i => i.coords && i.offset).flatMap(i => [-1, 1].map(s => lateralOffset(i.coords, i.offset, s))) }
  const hw = { 'centerStripe (map.json, no longer read)': POLYLINE_HALF_WIDTHS.stripe, 'parkingLine (offset ±)': POLYLINE_HALF_WIDTHS.edgeline, 'bikeLane (offset ±)': POLYLINE_HALF_WIDTHS.bikelane }
  for (const [k, ls] of Object.entries(lines)) {
    const rings = ls.map(c => polylineToRing(c, hw[k])).filter(Boolean), o = roadOffTheLattice({ x: rings }, R.protoShapeTiles, R.protoInkPieces, fp.boundaryRing).x
    const ds = ls.flatMap(c => c.map(p => [p.x ?? p[0], p.z ?? p[1]])).filter(p => roadOffTheLattice({ x: [[p]] }, [], [], fp.boundaryRing).x.n).map(near)
    console.log(`   ${k}: ${ls.length} line(s) · its line to ①'s ink ${q(ds)} · painted vertices in no tile and no piece ${o.off.length} of ${o.n}`)
  }
}
if (!towns) { console.log('⛔ no town produced ① tiles — nothing was checked'); bad++ }
console.log(`\n${bad ? '⛔ RED — a road vertex lies in no tile and no ink piece' : '✅ GREEN — every road vertex in the disc lies in a tile or an ink piece'}`)
process.exit(SELFTEST ? (bad ? 0 : 1) : (bad ? 1 : 0))
