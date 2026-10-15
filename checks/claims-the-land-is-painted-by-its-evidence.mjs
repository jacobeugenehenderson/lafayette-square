#!/usr/bin/env node
/**
 * claims-the-land-is-painted-by-its-evidence.mjs — IS THE LAND EVIDENCE DISJOINT, AS RULED?
 *
 * ⭐ THE RULE (Jacob, 2026-10-05; `derive.js` `layerLandEvidence`; RIBBONS §3.5 "Per-LU color"): the pour lays the
 *    land evidence out as DISJOINT regions, each with its class, and the painter paints each region it finds under a
 *    piece. Two regions over the same ground are two classes claiming it, and the painter strikes both.
 * ⛔ Found 2026-10-13 (Swale; Cairn's impact read for Boz): `layerLandEvidence` builds each region in its OWN Clipper
 *    op, on derive.js's own grid, so neighbours round their shared boundary separately and overlap in sub-cm bands.
 *    ⭐ The checks that already call `layerLandEvidence` (`claims-every-piece-takes-its-own-land-use.mjs`) feed it
 *    INTEGER-METRE, AXIS-ALIGNED boxes — nothing rounds there — so they cannot see this class. This check's hermetic leg
 *    feeds it ROTATED, OFF-LATTICE polygons instead.
 *
 * HOW IT MEASURES, with no threshold: the overlap AREA between every pair of regions, by Clipper at 10 × lattice.js's
 * CLIP_SCALE. The evidence's vertices sit on a coarser grid, so they are EXACT at that scale and any positive area is
 * ground claimed twice. Pairs are found through a uniform cell index (each region cut to the cells it reaches; a cell its
 * boundary misses is wholly in or out, read off a per-row crossing table), so the largest town runs in seconds.
 *   legs: (1) hermetic: `layerLandEvidence` on rotated, off-lattice polygons and parcels → its regions must be disjoint
 *         (2) per town: `ribbons.landEvidence` as committed → disjoint. A town whose ribbons carry no evidence: NOT MEASURED.
 *   reports: overlap m², the pairs that overlap — split by the painter's own grouping (`prepareEvidence`) into pairs ACROSS
 *   two paint groups (one ground painted two ways) and WITHIN one — and the widest band (mean width = 2 × area / perimeter,
 *   cell cuts excluded). ⛔ Every pair counts toward RED: the rule is disjoint regions, and the label (`labelFromEvidence`)
 *   sums region areas, so a same-group overlap is counted twice there.
 * ⭐ IMPORTABLE: `overlaps(regions)` → { total, pairs: [{ i, j, area, width, at }], perAll } on any [{ rings }] — a town's
 *   evidence or one tile's. It measures WHOLE regions, before any per-piece cut.
 *
 * ⭐ MUTATION-TESTED (`--selftest`, also run before every leg):
 *   · a planted 50 m² overlap reads 50 m² · a region wholly inside another, across many cells, reads its whole area
 *   · a region inside another's HOLE, the hole spanning many cells, reads 0 (a hole takes ground away, NonZero)
 *   · a region whose own two rings overlap reads as the painter reads it, NonZero (4 m² under its doubled ground)
 *   · two 1 km rotated strips overlapping 6 m across read 6,000 m² (edges crossing cells that hold none of their vertices)
 *   · a disjoint off-lattice partition with shared vertices (holes and fills included) reads EXACTLY 0 — GREEN is reachable
 *   · the same partition with ONE-SIDED ROUNDING (alternate regions floored to the cm instead of rounded) → RED
 *   · the cell index finds exactly the pairs brute-force pairwise Clipper finds on the hermetic leg's output, and the same
 *     area within the measuring grid's own rounding bound (perimeter × ½√2 / M)
 *
 *   node checks/claims-the-land-is-painted-by-its-evidence.mjs [<scene>] [--selftest]
 * Read-only. Exit 1 on overlap, 2 when nothing could be measured.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import clipperLib from 'clipper-lib'
import { ROOT, ribbonsPath, eachRibbonsTown } from './_scenes.mjs'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { layerLandEvidence } from '../cartograph/derive.js'
import { prepareEvidence } from '../src/lib/tileGround.js'

const { Clipper, Paths, IntPoint, ClipType, PolyType, PolyFillType } = clipperLib
const M = 10 * CLIP_SCALE          // the measuring grid: finer than any lattice the evidence is cut on
const CELL = 100                   // index cell, metres (a performance knob only: the measure is exact at any size)

// ── one region cut to one axis-aligned cell (Sutherland–Hodgman, per ring). A crossing is computed from the segment's
//    endpoints in a FIXED order, so two regions sharing an edge (walked in opposite directions) get the same point.
//    ⚠️ A mutant without the fixed order changes nothing in the selftest (a float difference that survives the rounding
//    to the measuring grid was not observed); kept for the shared-edge case it is written for. ──
function crossAt(p, q, axis, v) {
  const [a, b] = (p[0] < q[0] || (p[0] === q[0] && p[1] < q[1])) ? [p, q] : [q, p]
  const t = (v - a[axis]) / (b[axis] - a[axis])
  return axis === 0 ? [v, a[1] + t * (b[1] - a[1])] : [a[0] + t * (b[0] - a[0]), v]
}
function cropRing(ring, x0, x1, z0, z1) {
  let pts = ring
  for (const [axis, v, keep] of [[0, x0, (p) => p[0] >= x0], [0, x1, (p) => p[0] <= x1], [1, z0, (p) => p[1] >= z0], [1, z1, (p) => p[1] <= z1]]) {
    if (!pts.length) break
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], kp = keep(p), kq = keep(q)
      if (kp) out.push(p)
      if (kp !== kq) out.push(crossAt(p, q, axis, v))
    }
    pts = out
  }
  return pts.length >= 3 ? pts : null
}
const toPath = (r) => r.map(([x, z]) => new IntPoint(Math.round(x * M), Math.round(z * M)))
const perimeter = (paths) => paths.reduce((t, q) => t + q.reduce((u, p, n) => { const r = q[(n + 1) % q.length]; return u + Math.hypot(r.X - p.X, r.Y - p.Y) / M }, 0), 0)
const areaOf = (paths) => Math.abs(paths.reduce((t, q) => t + Clipper.Area(q), 0)) / (M * M)
// ⭐ NonZero, as the painter reads the evidence (`buildBlockGeometryV2.js#intersectRings`): a ring's orientation says
//    whether it adds ground or takes it away. (EvenOdd reads Huron's committed evidence 6 m² differently — measured.)
function intersect(a, b) {
  const c = new Clipper(); c.AddPaths(a, PolyType.ptSubject, true); c.AddPaths(b, PolyType.ptClip, true)
  const out = new Paths(); c.Execute(ClipType.ctIntersection, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return out
}

/** Every pair of regions that share ground: { total, pairs: [{ i, j, area, width, at }] }. Regions: [{ rings }]. */
export function overlaps(regions) {
  const R = regions.map(e => (e.rings || []).filter(r => r?.length >= 3))
  let gx = Infinity, gz = Infinity
  for (const rs of R) for (const r of rs) for (const [x, z] of r) { if (x < gx) gx = x; if (z < gz) gz = z }
  gx = Math.floor(gx / CELL) - 1; gz = Math.floor(gz / CELL) - 1
  const key = (cx, cz) => cx * 1048576 + cz
  const cells = new Map()          // key → Map(region → [paths])
  const put = (cx, cz, i, path) => { const k = key(cx, cz); const m = cells.get(k) || cells.set(k, new Map()).get(k); (m.get(i) || m.set(i, []).get(i)).push(path) }
  const rect = (cx, cz) => { const x0 = (gx + cx) * CELL, z0 = (gz + cz) * CELL; return [[x0, z0], [x0 + CELL, z0], [x0 + CELL, z0 + CELL], [x0, z0 + CELL]] }
  R.forEach((rings, i) => {
    for (const ring of rings) {
      // cells this ring's edges may pass through (each edge's own bbox — over-inclusion only costs a crop)
      const edged = new Set()
      let b = [Infinity, -Infinity, Infinity, -Infinity]
      for (let k = 0; k < ring.length; k++) {
        const p = ring[k], q = ring[(k + 1) % ring.length]
        const ax = Math.floor(Math.min(p[0], q[0]) / CELL) - gx, bx = Math.floor(Math.max(p[0], q[0]) / CELL) - gx
        const az = Math.floor(Math.min(p[1], q[1]) / CELL) - gz, bz = Math.floor(Math.max(p[1], q[1]) / CELL) - gz
        for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) edged.add(key(cx, cz))
        if (ax < b[0]) b[0] = ax; if (bx > b[1]) b[1] = bx; if (az < b[2]) b[2] = az; if (bz > b[3]) b[3] = bz
      }
      for (const k of edged) {
        const cx = Math.floor(k / 1048576), cz = k - cx * 1048576, [[x0, z0], , [x1, z1]] = rect(cx, cz)
        const c = cropRing(ring, x0, x1, z0, z1); if (c) put(cx, cz, i, toPath(c))
      }
      // a cell the ring's boundary misses is wholly inside or outside it: its centre's parity along the row. The cell
      // stands in for the ring there, so it carries the ring's orientation (a hole's cell takes ground away)
      let sa = 0; for (let k = 0; k < ring.length; k++) { const p = ring[k], q = ring[(k + 1) % ring.length]; sa += p[0] * q[1] - q[0] * p[1] }
      const ccw = sa > 0
      for (let cz = b[2]; cz <= b[3]; cz++) {
        const zc = (gz + cz + 0.5) * CELL, xs = []
        for (let k = 0; k < ring.length; k++) {
          const p = ring[k], q = ring[(k + 1) % ring.length]
          if ((p[1] > zc) !== (q[1] > zc)) xs.push(p[0] + (zc - p[1]) * (q[0] - p[0]) / (q[1] - p[1]))
        }
        xs.sort((u, v) => u - v)
        for (let s = 0; s + 1 < xs.length; s += 2) {
          for (let cx = Math.ceil(xs[s] / CELL - 0.5) - gx; (gx + cx + 0.5) * CELL < xs[s + 1]; cx++) {
            if (!edged.has(key(cx, cz))) put(cx, cz, i, toPath(ccw ? rect(cx, cz) : rect(cx, cz).reverse()))
          }
        }
      }
    }
  })
  const acc = new Map()
  let perAll = 0                   // every piece's whole perimeter, cell cuts included: what the measuring grid rounds
  for (const [k, m] of cells) {
    if (m.size < 2) continue
    const cx = Math.floor(k / 1048576), cz = k - cx * 1048576, [[x0, z0], , [x1, z1]] = rect(cx, cz)
    const X0 = Math.round(x0 * M), X1 = Math.round(x1 * M), Z0 = Math.round(z0 * M), Z1 = Math.round(z1 * M)
    const onCut = (p, q) => (p.X === q.X && (p.X === X0 || p.X === X1)) || (p.Y === q.Y && (p.Y === Z0 || p.Y === Z1))
    const ids = [...m.keys()]
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const out = intersect(m.get(ids[a]), m.get(ids[b])), area = areaOf(out)
      if (!(area > 0)) continue
      perAll += perimeter(out)
      let per = 0
      for (const q of out) for (let n = 0; n < q.length; n++) { const p = q[n], r = q[(n + 1) % q.length]; if (!onCut(p, r)) per += Math.hypot(r.X - p.X, r.Y - p.Y) / M }
      const pk = `${Math.min(ids[a], ids[b])},${Math.max(ids[a], ids[b])}`
      const e = acc.get(pk) || acc.set(pk, { i: Math.min(ids[a], ids[b]), j: Math.max(ids[a], ids[b]), area: 0, per: 0, at: [out[0][0].X / M, out[0][0].Y / M] }).get(pk)
      e.area += area; e.per += per
    }
  }
  const pairs = [...acc.values()].map(e => ({ ...e, width: e.per > 0 ? 2 * e.area / e.per : Infinity }))
  return { total: pairs.reduce((t, p) => t + p.area, 0), pairs, perAll }
}

// brute force, for the selftest only: every pair whose bboxes meet, by one Clipper op each
export function brute(regions, perPair = false) {
  const E = regions.map(e => { const rs = (e.rings || []).filter(r => r?.length >= 3); let b = [Infinity, -Infinity, Infinity, -Infinity]
    for (const r of rs) for (const [x, z] of r) { b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)] } return { p: rs.map(toPath), b } })
  let total = 0, perAll = 0; const pairs = new Set(), byPair = new Map()
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const a = E[i].b, b = E[j].b; if (a[0] > b[1] || a[1] < b[0] || a[2] > b[3] || a[3] < b[2]) continue
    const out = intersect(E[i].p, E[j].p), area = areaOf(out)
    if (area > 0) { total += area; perAll += perimeter(out); pairs.add(`${i},${j}`); if (perPair) byPair.set(`${i},${j}`, area) }
  }
  return { total, perAll, pairs, byPair }
}

const label = (e) => `${e.src ?? '?'}:${e.tag ?? e.lu}${e.crop != null ? (e.crop ? ':rows' : ':grass') : ''}`
function report(name, regions) {
  const t = Date.now(), o = overlaps(regions), sec = ((Date.now() - t) / 1000).toFixed(1)
  const widest = o.pairs.filter(p => Number.isFinite(p.width)).sort((a, b) => b.width - a.width)[0]
  const largest = [...o.pairs].sort((a, b) => b.area - a.area)[0]
  // the painter's own grouping (`tileGround.js#prepareEvidence`: evidence class | paint class), read, never restated: a
  // pair across two groups paints one ground two ways; a pair inside one group paints it once but is still two claims
  const group = regions.map(e => { const g = prepareEvidence([e])?.[0]; return g ? `${g.lu}|${g.paint}` : null })
  const cross = o.pairs.filter(p => group[p.i] !== group[p.j]), crossM2 = cross.reduce((t, p) => t + p.area, 0)
  console.log(`   ${o.total > 0 ? '⛔' : '✅'} ${name}: ${regions.length} regions · overlap ${o.total.toFixed(3)} m² over ${o.pairs.length} pair(s) · ${sec} s`)
  if (o.pairs.length) console.log(`      across paint groups ${crossM2.toFixed(3)} m² over ${cross.length} pair(s) · within one group ${(o.total - crossM2).toFixed(3)} m² over ${o.pairs.length - cross.length}`)
  if (largest) console.log(`      largest ${largest.area.toFixed(3)} m² at (${largest.at.map(v => v.toFixed(1))}) · ${label(regions[largest.i])} × ${label(regions[largest.j])}`)
  if (widest) console.log(`      widest band ${(widest.width * 1000).toFixed(2)} mm mean (${widest.area.toFixed(3)} m²) at (${widest.at.map(v => v.toFixed(1))}) · ${label(regions[widest.i])} × ${label(regions[widest.j])}`)
  return o
}

// ── the hermetic input: rotated quads off any lattice (seeded), three OSM kinds and two parcel classes ──
function hermeticInput() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const quad = (cx, cz, w, h, th) => [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, z]) => [cx + x * Math.cos(th) - z * Math.sin(th), cz + x * Math.sin(th) + z * Math.cos(th)])
  const lus = { 'leisure:park': 'park', 'natural:wood': 'recreation', 'landuse:residential': 'residential', 'landuse:retail': 'commercial', 'landuse:farmland': 'agricultural' }
  const tags = Object.keys(lus)
  const osm = Array.from({ length: 200 }, () => { const tag = tags[Math.floor(rnd() * tags.length)]
    return { lu: lus[tag], tag, ring: quad(rnd() * 500, rnd() * 500, 5 + rnd() * 40, 5 + rnd() * 40, rnd() * Math.PI).map(([x, z]) => ({ x, z })) } })
  const parcels = Array.from({ length: 300 }, () => ({ lu: rnd() < 0.5 ? 'residential' : 'commercial', rings: [quad(rnd() * 500, rnd() * 500, 5 + rnd() * 20, 5 + rnd() * 20, rnd() * Math.PI)] }))
  return { osm, parcels }
}

// ── selftest: every one must hold, or nothing this check prints means anything ──
function selftest() {
  const fails = [], sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
  const say = (ok, what) => { console.log(`   selftest ${ok ? '✓' : '✗'} ${what}`); if (!ok) fails.push(what) }
  const planted = overlaps([{ rings: [sq(0, 0, 10, 10)] }, { rings: [sq(5, 0, 15, 10)] }, { rings: [sq(20, 0, 30, 10)] }])
  say(Math.abs(planted.total - 50) < 1e-6 && planted.pairs.length === 1, `a planted 50 m² overlap reads ${planted.total.toFixed(6)} m² over ${planted.pairs.length} pair(s)`)
  const inside = overlaps([{ rings: [sq(-500, -500, 500, 500)] }, { rings: [sq(-151.5, -151.5, 148.5, 148.5)] }])
  say(Math.abs(inside.total - 90000) < 1e-6, `a region wholly inside another, across many cells, reads ${inside.total.toFixed(6)} m² (90,000)`)
  const holed = overlaps([{ rings: [sq(-500, -500, 500, 500), sq(-300, -300, 300, 300).reverse()] }, { rings: [sq(-151.5, -151.5, 148.5, 148.5)] }])
  say(holed.total === 0, `a region inside another's HOLE (the hole spanning many cells) reads ${holed.total} m² — a hole takes ground away`)
  const doubled = overlaps([{ rings: [sq(0, 0, 10, 10), sq(5, 0, 15, 10)] }, { rings: [sq(6, 2, 8, 4)] }])
  say(Math.abs(doubled.total - 4) < 1e-6, `a region whose own two rings overlap is read as the painter reads it (NonZero): ${doubled.total.toFixed(6)} m² (4) under its doubled ground`)
  // long rotated edges crossing many cells that hold none of their vertices: two 1 km strips, 10 m wide, offset 4 m across
  const strip = (off) => [[0, off], [1000, off], [1000, off + 10], [0, off + 10]].map(([x, z]) => [x * Math.cos(0.3) - z * Math.sin(0.3) + 0.123, x * Math.sin(0.3) + z * Math.cos(0.3) - 0.456])
  const long = overlaps([{ rings: [strip(0)] }, { rings: [strip(4)] }])
  say(Math.abs(long.total - 6000) < 0.01, `two 1 km rotated strips overlapping 6 m across read ${long.total.toFixed(6)} m² (6,000) — edges cross cells that hold none of their vertices`)
  // a disjoint partition, off the lattice, rotated: a jittered grid of quads sharing their vertices exactly, one quad
  // a ring with a HOLE and the hole's fill its own region
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const N = 12, th = 0.37, V = []
  for (let a = 0; a <= N; a++) { V.push([]); for (let b = 0; b <= N; b++) { const x = a * 37.3 + rnd() * 9, z = b * 41.7 + rnd() * 9; V[a].push([x * Math.cos(th) - z * Math.sin(th), x * Math.sin(th) + z * Math.cos(th)]) } }
  const grid = (snap) => { const out = []
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      const s = snap(a + b), q = [V[a][b], V[a + 1][b], V[a + 1][b + 1], V[a][b + 1]].map(p => p.map(s))
      if (a === 5 && b === 5) { const c = q.reduce((t, p) => [t[0] + p[0] / 4, t[1] + p[1] / 4], [0, 0]).map(s), h = [[-5, -5], [5, -5], [5, 5], [-5, 5]].map(([x, z]) => [c[0] + x, c[1] + z]).map(p => p.map(s))
        out.push({ rings: [q, h.slice().reverse()] }, { rings: [h] }) }
      else out.push({ rings: [q] })
    }
    return out }
  const cm = (v) => Math.round(v * 100) / 100, floorCm = (v) => Math.floor(v * 100) / 100
  const clean = overlaps(grid(() => cm))
  say(clean.total === 0, `a disjoint off-lattice partition with shared vertices (a hole and its fill included) reads ${clean.total} m² — GREEN is reachable`)
  const mutant = overlaps(grid((k) => k % 2 ? floorCm : cm))
  say(mutant.total > 0, `mutant: ONE-SIDED ROUNDING (alternate regions floored to the cm) reads ${mutant.total.toFixed(4)} m² over ${mutant.pairs.length} pair(s) → RED`)
  const { osm, parcels } = hermeticInput(), ev = layerLandEvidence(osm, parcels, null).evidence
  // ⭐ the SAME pairs, exactly; the area within what the measuring grid can round: every crossing vertex moves ≤ ½√2/M,
  //    so an area moves ≤ its pieces' perimeter × ½√2/M (the index cuts at cell borders, so its pieces differ from brute's)
  const I = overlaps(ev), B = brute(ev), ip = new Set(I.pairs.map(p => `${p.i},${p.j}`))
  const samePairs = ip.size === B.pairs.size && [...ip].every(k => B.pairs.has(k)), bound = (I.perAll + B.perAll) * Math.SQRT1_2 / M
  say(samePairs && Math.abs(I.total - B.total) <= bound, `the cell index finds the same ${ip.size} pair(s) as brute-force pairwise Clipper (${B.pairs.size}) on the hermetic output; area ${I.total.toFixed(6)} vs ${B.total.toFixed(6)} m², |Δ| ${Math.abs(I.total - B.total).toFixed(6)} ≤ the grid's rounding bound ${bound.toFixed(6)}`)
  return fails
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
function main() {
const argv = process.argv.slice(2)
const sf = selftest()
if (sf.length) { console.log(`   ⛔ SELFTEST FAILED — this check measures nothing until it passes`); process.exit(1) }
if (argv.includes('--selftest')) process.exit(0)

const scene = eachRibbonsTown({ argv: argv.filter(a => a !== '--selftest') })
let red = false
{ const { osm, parcels } = hermeticInput(); red = report('hermetic: layerLandEvidence on rotated, off-lattice polygons and parcels', layerLandEvidence(osm, parcels, null).evidence).total > 0 }
const path = join(ROOT, ribbonsPath(scene))
const ev = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).landEvidence : undefined
if (!Array.isArray(ev)) { console.log(`   ⛔ NOT MEASURED — ${scene}: ${ribbonsPath(scene)} carries no landEvidence (a pour from before the evidence). This is not a pass.`); process.exit(2) }
red = report(`${scene}: ribbons.landEvidence (${ribbonsPath(scene)})`, ev).total > 0 || red
if (red) console.log(`   ⛔ the evidence is NOT disjoint: ground is claimed twice (RIBBONS §3.5 "Per-LU color"; derive.js layerLandEvidence)`)
process.exit(red ? 1 : 0)
}
