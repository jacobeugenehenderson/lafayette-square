// census.mjs <scene> — TRAFFIC ISLANDS, read off data (Boz, 2026-10-18; Jacob: "in jackson heights this is likely all concrete;
// we should refer to the guides and develop a rule"). Read-only.
//   IDENTITY   a ① block (a tile's ② ring) whose area lies ≥ 90 % outside every parcel (raw/*_parcels.json; Lath measured the
//              street right-of-way 90–98 % outside parcels in every town, scratch/footprint-census/row-parcels.mjs)
//   CROSSINGS  recorded crossings landed on its ring by the pour (`crosswalkEnds`), and how many carry an island tag
//   EVIDENCE   an OSM polygon covering most of it (≥ 50 % of its samples): planted (landuse grass/garden/…, leisure, natural)
//              or paved (area:highway / surface paved) — a surface the data decides
//   DRAFT RULE paved when, after the curb (the town's curb width) and its crossings' cut-throughs (the norm's width on each
//              crossing's own line), no planted piece of at least r-house-island-min-area (50 sq ft, 4.65 m²) remains
import { readFileSync, readdirSync } from 'fs'
import clipperLib from 'clipper-lib'
import { feed } from '../../_proto-feed.mjs'
import { resolveCurbCutNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readSources } from '../../../cartograph/sources.js'
import { intersectRings, differenceRings } from '../../../src/lib/buildBlockGeometryV2.js'
const { buildTileGround } = await import('../../../src/lib/tileGround.js')
const scene = process.argv[2], RAW = `/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/${scene}/raw`   // the main tree's raw data, read only
const MIN = 4.65, f = feed(scene), src = readSources(scene), nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
const R = buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true })
console.log = pl; console.warn = pw
const pip = (x, z, r) => { let w = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) w = !w } return w }
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a) / 2 }
const bbox = (r) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] }
const indexed = (polys) => { const G = 50, grid = new Map(); polys.forEach((p, i) => { const [a, b, c, d] = p.bb; for (let x = Math.floor(a / G); x <= Math.floor(c / G); x++) for (let z = Math.floor(b / G); z <= Math.floor(d / G); z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)).push(i) } })
  return (x, z) => (grid.get(Math.floor(x / G) + ',' + Math.floor(z / G)) || []).filter(i => pip(x, z, polys[i].r)).map(i => polys[i]) }
// parcels
const parcels = []; for (const fn of readdirSync(RAW).filter(fn => /_parcels\.json$/.test(fn))) for (const p of JSON.parse(readFileSync(`${RAW}/${fn}`, 'utf8')).parcels) for (const r of p.rings || []) parcels.push({ r, bb: bbox(r) })
const inParcel = indexed(parcels)
// surface polygons from OSM
const osm = JSON.parse(readFileSync(`${RAW}/osm.json`, 'utf8'))
const PLANT_LU = new Set(['grass', 'garden', 'flowerbed', 'meadow', 'village_green', 'recreation_ground', 'forest', 'plant_nursery'])
const surf = []; for (const [layer, ws] of Object.entries(osm.ground || {})) for (const w of ws || []) { if (!w.isClosed && !(w.coords?.length > 3 && w.coords[0].lon === w.coords[w.coords.length - 1].lon)) continue
  const t = w.tags || {}, r = w.coords.map(c => [c.x, c.z]); let kind = null
  if ((layer === 'landuse' && PLANT_LU.has(t.landuse)) || layer === 'natural' || (layer === 'leisure' && ['park', 'garden', 'playground', 'common'].includes(t.leisure))) kind = 'planted'
  if (t['area:highway'] || (t.surface && /paved|asphalt|concrete|paving_stones|sett/.test(t.surface) && layer !== 'highway')) kind = 'paved'
  if (kind) surf.push({ r, bb: bbox(r), kind }) }
const inSurf = indexed(surf)
const islandTag = new Set((osm.ground?.highway || []).filter(w => w.tags?.footway === 'crossing' && (w.tags['crossing:island'] === 'yes' || w.tags.traffic_island)).map(w => w.osmId))
const T = R.protoShapeTiles || [], W = nm.width, cw = f.curbWidth ?? 0.15
const S = 1000, inset = (rings, d) => { const co = new clipperLib.ClipperOffset(); for (const r of rings) co.AddPath(r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) })), clipperLib.JoinType.jtMiter, clipperLib.EndType.etClosedPolygon)
  const out = []; co.Execute(out, -d * S); return out.map(p => p.map(q => [q.X / S, q.Y / S])) }
const byId = new Map(); T.forEach(t => (t?.crosswalkEnds || []).forEach(x => (byId.get(x.osmId) || byId.set(x.osmId, []).get(x.osmId)).push(x)))
const isl = []
T.forEach((t, ti) => (t?.iaFull || []).forEach((ring, si) => {
  if (!ring || ring.length < 3) return
  const A = area(ring); if (!(A > 0.5) || A > 20000) return                     // a whole superblock is not an island
  const [a, b, c, d] = bbox(ring), step = Math.max(0.4, Math.sqrt(A / 300)); let n = 0, out = 0; const sv = { planted: 0, paved: 0 }
  for (let x = a + step / 2; x < c; x += step) for (let z = b + step / 2; z < d; z += step) { if (!pip(x, z, ring)) continue; n++
    if (!inParcel(x, z).length) out++; const s2 = inSurf(x, z); if (s2.some(p => p.kind === 'paved')) sv.paved++; else if (s2.some(p => p.kind === 'planted')) sv.planted++ }
  if (!n || out / n < 0.9) return
  const ends = (t.crosswalkEnds || []).filter(x => x.si === si), ids = [...new Set(ends.map(x => x.osmId))]
  // the draft rule: curb off, cut-throughs off, what planted pieces remain
  let ground = inset([ring], cw)
  for (const x of ends) { const o = (byId.get(x.osmId) || []).find(y => y !== x); if (!o) continue
    const d0 = [x.at[0] - o.at[0], x.at[1] - o.at[1]], l = Math.hypot(...d0); if (!(l > 0.1)) continue
    const u = [d0[0] / l, d0[1] / l], nn = [-u[1], u[0]], h = W / 2, L = 200
    const strip = [[x.at[0] + nn[0] * h + u[0] * 1, x.at[1] + nn[1] * h + u[1] * 1], [x.at[0] + nn[0] * h - u[0] * L, x.at[1] + nn[1] * h - u[1] * L], [x.at[0] - nn[0] * h - u[0] * L, x.at[1] - nn[1] * h - u[1] * L], [x.at[0] - nn[0] * h + u[0] * 1, x.at[1] - nn[1] * h + u[1] * 1]]
    ground = ground.length ? differenceRings(ground, [strip]) : ground }
  const pieces = ground.map(area).filter(v => v > 0.01), big = pieces.filter(v => v >= MIN)
  // variant B: plantable only where a piece holds the house curbed minimum width (r-house-curbed-min-width, 4 ft = 1.22 m) —
  // the piece shrunk by half that width must keep 50 sq ft
  const core = ground.length ? inset(ground, 0.61) : [], wide = core.map(area).filter(v => v >= MIN)
  isl.push({ at: ring[0], A, crossings: ids.length, tagged: ids.filter(i => islandTag.has(i)).length, ev: sv.paved / n >= 0.5 ? 'paved' : sv.planted / n >= 0.5 ? 'planted' : null, rule: big.length ? 'planted remains' : 'paved', ruleB: wide.length ? 'planted remains' : 'paved' })
}))
const q = (L, k) => L.filter(k).length
const sz = (L) => { const b = [[0, 5], [5, 20], [20, 100], [100, 500], [500, 20001]]; return b.map(([a, z]) => `${a}–${z > 20000 ? '' : z} m²: ${L.filter(o => o.A >= a && o.A < z).length}`).join(' · ') }
console.log(`${scene}: ${isl.length} island(s) (≥ 90 % outside parcels; ${parcels.length} parcel rings) — size ${sz(isl)}`)
console.log(`  crossings: with ≥1 recorded ${q(isl, o => o.crossings)} · island-tagged crossings on ${q(isl, o => o.tagged)} · none ${q(isl, o => !o.crossings)}`)
console.log(`  surface the DATA decides: paved ${q(isl, o => o.ev === 'paved')} · planted ${q(isl, o => o.ev === 'planted')} · undecided ${q(isl, o => !o.ev)}`)
console.log(`  DRAFT RULE on the undecided: paved ${q(isl, o => !o.ev && o.rule === 'paved')} (of them with crossings ${q(isl, o => !o.ev && o.rule === 'paved' && o.crossings)}) · planted remains ${q(isl, o => !o.ev && o.rule !== 'paved')}`)
console.log(`  VARIANT B (min width 1.22 m) on the undecided: paved ${q(isl, o => !o.ev && o.ruleB === 'paved')} (with crossings ${q(isl, o => !o.ev && o.ruleB === 'paved' && o.crossings)}) · planted remains ${q(isl, o => !o.ev && o.ruleB !== 'paved')} · against data-planted: says paved at ${q(isl, o => o.ev === 'planted' && o.ruleB === 'paved')}`)
console.log(`  by size, undecided, B paved: ${[[0, 100], [100, 500], [500, 20001]].map(([a2, z]) => `${a2}–${z > 20000 ? '' : z} m² ${q(isl, o => !o.ev && o.A >= a2 && o.A < z && o.ruleB === 'paved')}/${q(isl, o => !o.ev && o.A >= a2 && o.A < z)}`).join(' · ')}`)
console.log(`  where the data decides planted, the rule would say paved at ${q(isl, o => o.ev === 'planted' && o.rule === 'paved')} (a disagreement to look at)`)
