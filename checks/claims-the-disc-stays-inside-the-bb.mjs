#!/usr/bin/env node
// ⭐ THE DISC STAYS INSIDE THE BOUNDING BOX — `EXTENT-DESIGN §4`: the seal must enforce `bbox ⊇ disc + padding`.
// The radius cuts the geometry and the edge's fade runs inward from it (Stage › Horizon › Edge); an operator who wants
// more at the edge pulls the radius out in Extent — which is only honest while the circle stays inside the data that
// was fetched (`cartograph/data/<scene>/geography.json` `bbox`). Past it, the rim shows ground nobody fetched.
// Reads both files; restates neither.
//
//   node checks/claims-the-disc-stays-inside-the-bb.mjs            every scene with a disc and a bbox
//   node checks/claims-the-disc-stays-inside-the-bb.mjs --selftest a fixture disc past its box must fail
//
// ⚠️ PADDING IS UNSPECIFIED: `EXTENT-DESIGN §4` names a padding (a PERCENTAGE on top of the disc,
// `_archive/EXTENT-EXCAVATION-DIARY-2026-09-13.md §0.4`) and never quantifies it, so this enforces bbox ⊇ disc with
// padding 0 and says so. Its value is Jacob's.
// ⛔ FAILS on any disc past its box. Altadena is (−981 m), the same figure EXTENT-DESIGN §4 records: a known condition,
// whose fix (shrink its radius, or re-fetch a larger box) is Jacob's. ⛔ Never worked around here.
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const DATA = 'cartograph/data'
// The local frame: x east, z south (z = −Δlat), metres via the town's own lon/lat scale (geography.json).
export function discMargin(geo, nb) {
  const B = geo.bbox
  const x0 = (B.minLon - geo.lon) * geo.lonToMeters, x1 = (B.maxLon - geo.lon) * geo.lonToMeters
  const z0 = -(B.maxLat - geo.lat) * geo.latToMeters, z1 = -(B.minLat - geo.lat) * geo.latToMeters
  const [cx, cz] = nb.center || [0, 0], R = nb.radius
  return Math.min(cx - R - x0, x1 - (cx + R), cz - R - z0, z1 - (cz + R))
}

if (process.argv.includes('--selftest')) {
  const geo = { lat: 0, lon: 0, lonToMeters: 100000, latToMeters: 100000, bbox: { minLat: -0.01, maxLat: 0.01, minLon: -0.01, maxLon: 0.01 } }   // ±1000 m
  const inside = discMargin(geo, { center: [0, 0], radius: 800 }), past = discMargin(geo, { center: [0, 0], radius: 1200 })
  const shifted = discMargin(geo, { center: [300, 0], radius: 800 })
  const ok = Math.round(inside) === 200 && Math.round(past) === -200 && Math.round(shifted) === -100
  console.log(`${ok ? '✅' : '⛔'} selftest: inside ${inside.toFixed(0)} m · past ${past.toFixed(0)} m · off-centre ${shifted.toFixed(0)} m`)
  process.exit(ok ? 0 : 1)
}

console.log('padding: UNSPECIFIED (EXTENT-DESIGN §4 names a percentage it never quantifies) — enforcing bbox ⊇ disc, padding 0\n')
let bad = 0
for (const s of readdirSync(DATA).sort()) {
  const gP = join(DATA, s, 'geography.json'), bP = join(DATA, s, 'neighborhood_boundary.json')
  if (!existsSync(bP)) continue
  if (!existsSync(gP)) { console.log(`⛔ ${s.padEnd(26)} has a disc and NO geography.json — no box to hold it in. NOT checked.`); bad++; continue }
  const geo = JSON.parse(readFileSync(gP, 'utf8')), nb = JSON.parse(readFileSync(bP, 'utf8'))
  if (!geo.bbox || !Number.isFinite(nb.radius)) { console.log(`⛔ ${s.padEnd(26)} missing bbox or radius — NOT checked.`); bad++; continue }
  const m = discMargin(geo, nb)
  if (m < 0) bad++
  console.log(`${m < 0 ? '⛔' : '✅'} ${s.padEnd(26)} R ${String(nb.radius).padStart(5)} m · tightest margin ${m.toFixed(0).padStart(6)} m${m < 0 ? '  ← the disc reaches past the fetched data (EXTENT-DESIGN §4)' : ''}`)
}
console.log(bad ? `\n⛔ ${bad} disc(s) not inside their box` : '\n✅ every disc lies inside its bounding box')
process.exit(bad ? 1 : 0)
