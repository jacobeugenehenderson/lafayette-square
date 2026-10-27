#!/usr/bin/env node
// CLAIM — THE SHORE AGREES WITH THE FIELD (BRIEF-the-shore-is-one-line §4, Boz 2026-10-25).
//
// The water the bake digs its bed under (clean/coast.json, rasterised by coastFile.mjs#maskOf — the bake's own cells) and
// the height field must say the same thing about where the land ends:
//   (a) DRY BED — cells under the mask whose lidar stood above that cell's HIGH level: land the coast called water. The
//       bed overwrites them, so terrain.bin cannot show it; bake-terrain#writeBed RECORDS them, before digging, as
//       terrain.json `bed.dry` (row runs; rock excluded, `bed.rock`). Read here, never recomputed (the slot-run
//       cross-check is checks/claims-the-dry-bed-record-is-the-lidar.mjs). ⭐ GATED AT 0 off the line (Boz, 2026-10-25):
//       a cell whose centre lies within one grid diagonal of a coast edge straddles a line traced at the source's pixel,
//       so it may read either way; those are printed, never gated. No dry baseline is carried. ⭐ A dry cell inside a tagged
//       deck footprint (structures.mjs#deckFootprints, masked as water by rule) is LISTED by identity, never gated (Jacob's
//       ruling (c), 2026-10-27): its footprint, OSM features, m² and the lidar above HIGH (`bed.dry.aboveHighM`, per cell).
//   (b) WET LAND — on terrain.bin: ground OUTSIDE the mask, inside the disc, below that cell's LOW level: water at every
//       tide that the coast called land (Zob's definition; Boz, 2026-10-25).
//   and, printed for the sand line (step 4), never gated: the INTERTIDAL — ground outside the mask below HIGH and
//       4-connected to the water (a mapped dike holds it: coastFile.mjs#heldCells), the band the tide covers: the beach.
// Both are printed in m² per town. (a) is gated at 0 off the line; (b) only where it TOUCHES ①'s water, within the lidar's RMSEz (below).
// ⭐ SEEN TO FAIL, every run: (b) is measured again with the mask shifted by the brief's p50 coast-vs-lidar offset
// (4.34 m) on each axis; a mask that is not the shore must not score better, or the instrument cannot see the shore.
// A town with no coast.json or no `bed.dry` (baked before the record) is NOT CHECKED for that part, and says so.
//
//   node checks/claims-the-shore-agrees-with-the-field.mjs [--scene=<id> …] [--data-root=<dir>]
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { readCoast, maskOf, heldCells, COAST_FILE } from '../cartograph/coastFile.mjs'
import { waterLevels } from '../cartograph/waterLevel.mjs'
import { localBB, projectorOf, geographyFor } from '../cartograph/geography.mjs'
import { ringsInDrawing } from '../cartograph/coast-in-drawing.mjs'
import { discOf } from '../cartograph/boundaryRecords.mjs'
import { deckFootprints, deckStructures } from '../cartograph/structures.mjs'

// ⭐ (b)'s GATE (Boz, 2026-10-27): only wet land that TOUCHES ①'s water is a shore drawn short; land below the level apart from it
// stays land, as ruled (a polder, the back of a dyke), and is printed as information. A touching region passes when its depth
// below LOW is within the lidar's own stated vertical accuracy (its RMSEz: the flights' quality level, references
// f-3dep-ql-rmsez, read the way bake-terrain reads it). ⛔ The dated 350 m² baseline is retired: it was taken on the OSM coast,
// a different line. No (a) baseline: Zob's post-dig figure was the kept rock, which bed.dry excludes (Boz, 2026-10-25).
const rmsezOf = (dir, scene) => {
  const fp = join(dir, 'raw', 'elevation-flights.json')   // cartograph/fetch-lidar-flights.mjs FLIGHTS_FILE
  if (!existsSync(fp)) throw new Error(`⛔ ${scene}: no raw/elevation-flights.json — the lidar's quality level, so its stated vertical accuracy, is unknown`)
  const qls = [...new Set(Object.values(JSON.parse(readFileSync(fp, 'utf8')).projects || {}).map(p => String(p.ql || '').replace(/\s+/g, '')))]
  const table = JSON.parse(readFileSync(join(ROOT, 'references', 'registry.json'), 'utf8')).findings.find(f => f.id === 'f-3dep-ql-rmsez')?.value?.rmsezM || {}
  const r = qls.map(q => table[q])
  if (!r.length || !r.every(Number.isFinite)) throw new Error(`⛔ ${scene}: the lidar's quality level (${qls.join(', ') || 'none stated'}) has no stated RMSEz in references (f-3dep-ql-rmsez)`)
  return { rmsezM: Math.max(...r), qls }
}
// the gate's one decision: the touching regions deeper below LOW than the lidar's stated accuracy
const overBound = (sites, rmsezM) => sites.filter(w => w.touches && w.deep > rmsezM)
{ // SEEN TO FAIL, every run: planted regions through the same predicate
  const planted = [{ touches: true, deep: 0.05, m2: 25, at: [0, 0] }, { touches: false, deep: 0.5, m2: 100, at: [0, 0] }, { touches: true, deep: 0.2, m2: 25, at: [0, 0] }]
  const o = overBound(planted, 0.1)
  if (!(o.length === 1 && o[0].deep === 0.2)) { console.log('⛔ the (b) gate is blind: a planted touching region 0.2 m below LOW past a 0.1 m bound is not caught, or a hollow apart from the water is'); process.exit(1) }
  console.log('✅ the (b) gate sees: of three planted regions, only the touching one past the bound fails (a deeper hollow apart from the water does not)')
}
// ⭐ (a) UNDER A DECK (Jacob, 2026-10-27, ruling (c): "bake it and I'll look"): a tagged deck footprint is masked as water by
// rule (bake-coast), so the lidar under it may read the deck, not the water. A dry-bed cell inside a deck footprint is LISTED BY
// IDENTITY (the footprint, its OSM features, m², the lidar above HIGH), never counted; every other dry cell off the line gates.
// `deckOf(x, z)` → the footprint's index, or −1. The one decision, so the planted row below reads the same code as the towns.
const sortDry = (cells, deckOf) => {
  const listed = new Map(), gated = []
  for (const c of cells) { const k = deckOf(c.x, c.z); if (k < 0) { gated.push(c); continue }
    if (!listed.has(k)) listed.set(k, []); listed.get(k).push(c) }
  return { listed, gated }
}
{ // SEEN TO FAIL, every run: one planted dry cell under a deck, one beside it
  const { listed, gated } = sortDry([{ x: 5, z: 5, above: 2 }, { x: 50, z: 5, above: 2 }], (x, z) => (x < 10 && z < 10 ? 0 : -1))
  if (!(listed.get(0)?.length === 1 && gated.length === 1 && gated[0].x === 50)) { console.log('⛔ the (a) deck listing is blind: a planted dry cell beside a deck is not gated, or one under it is not listed'); process.exit(1) }
  console.log('✅ the (a) deck listing sees: of two planted dry cells, the one under a deck is listed and the one beside it gates')
}
const P50_M = 4.34   // the brief's §0: the lidar trace's p50 offset off ①'s OSM coast on Huron

const args = process.argv.slice(2).filter(a => a.startsWith('--scene=')).map(a => a.slice(8))
const DATA = process.argv.find(a => a.startsWith('--data-root='))?.slice(12) || ROOT   // a checkout (or probe) holding cartograph/data
// every town with a coast: one with a coast.json, one whose lidar flights are on record, or one whose ① draws water (a coast
// not yet traced is NOT CHECKED by name below, never silently absent)
const drawsCoast = (t) => { const mp = join(DATA, 'cartograph/data', t, 'clean', 'map.json'); if (!existsSync(mp)) return false
  try { return (JSON.parse(readFileSync(mp, 'utf8')).layers?.ribbons?.protopolygon?.waterRings?.length || 0) > 0 } catch { return false } }
const scenes = args.length ? args : readdirSync(join(DATA, 'cartograph/data')).filter(t => existsSync(join(DATA, 'cartograph/data', t, 'clean', COAST_FILE))
  || existsSync(join(DATA, 'cartograph/data', t, 'raw', 'elevation-flights.json')) || drawsCoast(t))
let red = 0, checked = 0
for (const scene of scenes) {
  const dir = join(DATA, 'cartograph/data', scene)
  const tjp = join(dir, 'clean/terrain.json'), tbp = join(dir, 'clean/terrain.bin')
  if (!existsSync(join(dir, 'clean', COAST_FILE)) || !existsSync(tjp) || !existsSync(tbp)) { console.log(`── ${scene}: NOT CHECKED — needs clean/${COAST_FILE}, terrain.json and terrain.bin`); continue }
  const tj = JSON.parse(readFileSync(tjp, 'utf8')), tb = readFileSync(tbp)
  const H = new Float32Array(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength))
  const { width: W, height: Ht, bounds } = tj
  const osm = JSON.parse(readFileSync(join(dir, 'raw/osm.json'), 'utf8'))
  const coast = readCoast(join(dir, 'clean'), localBB(osm, projectorOf(geographyFor(scene))), 'claims-the-shore-agrees-with-the-field')
  if (!coast.coast) { console.log(`── ${scene}: inland (${coast.why})`); continue }
  if (!tj.water) { console.log(`⛔ ${scene}: terrain.json has no water levels — baked before the coast?`); red++; continue }
  checked++
  const L = waterLevels(tj.water)
  const sx = (bounds.maxX - bounds.minX) / (W - 1), sz = (bounds.maxZ - bounds.minZ) / (Ht - 1), cellM2 = sx * sz
  const X = (i) => bounds.minX + i * sx, Z = (j) => bounds.minZ + j * sz
  const { held } = heldCells(osm.ground, { W, H: Ht, x0: bounds.minX, z0: bounds.minZ, step: sx })
  const rings = ringsInDrawing(coast.rings, bounds).inDrawing
  const disc = discOf(JSON.parse(readFileSync(join(dir, 'neighborhood_boundary.json'), 'utf8')), 'claims-the-shore-agrees-with-the-field')
  // `sites`: the wet cells as 8-connected regions — m², centre, deepest below LOW, and whether the region TOUCHES ①'s water
  // (a neighbour in the mask: a shore the coast drew short) or stands apart from it (a hollow inland)
  const wetLand = (rs, sites = null) => {
    const mask = maskOf(rs, W, Ht, bounds)
    let n = 0, any = 0
    const wet = sites ? new Uint8Array(W * Ht) : null
    for (let j = 0; j < Ht; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i
      if (mask[k]) { any++; continue }
      if (H[k] < L.lowAt(X(i), Z(j)) && disc.inDisc(X(i), Z(j))) { n++; if (wet) wet[k] = 1 }
    }
    if (!any) throw new Error(`⛔ ${scene}: the coast's ${rs.length} ring(s) cover NO cell of the terrain grid — the mask and the grid disagree about the frame; an empty mask would score 0 and pass blind`)
    if (sites) for (let k0 = 0; k0 < W * Ht; k0++) { if (wet[k0] !== 1) continue
      const st = [k0]; wet[k0] = 2; let c = 0, sxs = 0, szs = 0, deep = 0, touches = false
      while (st.length) { const k = st.pop(), i = k % W, j = (k - i) / W; c++; sxs += X(i); szs += Z(j); deep = Math.max(deep, L.lowAt(X(i), Z(j)) - H[k])
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= Ht) continue
          const q = jj * W + ii; if (mask[q]) touches = true; if (wet[q] === 1) { wet[q] = 2; st.push(q) } } }
      sites.push({ m2: c * cellM2, at: [sxs / c, szs / c], deep, touches }) }
    return n * cellM2
  }
  const intertidal = (rs) => {
    const mask = maskOf(rs, W, Ht, bounds), seen = new Uint8Array(W * Ht), queue = new Int32Array(W * Ht)
    let qt = 0, n = 0
    for (let k = 0; k < W * Ht; k++) if (mask[k]) { seen[k] = 1; queue[qt++] = k }
    if (!qt) throw new Error(`⛔ ${scene}: the coast's ${rs.length} ring(s) cover NO cell of the terrain grid — the mask and the grid disagree about the frame; an empty mask would score 0 and pass blind`)
    for (let qh = 0; qh < qt; qh++) {
      const k = queue[qh], i = k % W, j = (k - i) / W
      for (const [ii, jj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (ii < 0 || jj < 0 || ii >= W || jj >= Ht) continue
        const q = jj * W + ii
        if (seen[q] || held[q] || !(H[q] < L.highAt(X(ii), Z(jj)))) continue
        seen[q] = 1; n++; queue[qt++] = q
      }
    }
    return n * cellM2
  }
  console.log(`── ${scene}: ${coast.doc.from}`)
  const wetSites = [], wet = wetLand(rings, wetSites), tide = intertidal(rings)
  const shifted = Math.min(...[[P50_M, 0], [-P50_M, 0], [0, P50_M], [0, -P50_M]].map(([dx, dz]) => wetLand(rings.map(r => r.map(([x, z]) => [x + dx, z + dz])))))
  const { rmsezM, qls } = rmsezOf(dir, scene), touching = wetSites.filter(w => w.touches), over = overBound(wetSites, rmsezM)
  const okWet = over.length === 0, seesShore = shifted >= wet
  console.log(`  ${okWet ? '✅' : '⛔'} (b) wet land TOUCHING ①'s water: ${touching.length} region(s), ${Math.round(touching.reduce((t, w) => t + w.m2, 0)).toLocaleString()} m², deepest ${touching.length ? Math.max(...touching.map(w => w.deep)).toFixed(3) : '—'} m below LOW (bound: the lidar's RMSEz ${rmsezM} m, ${qls.join('/')})${over.length ? ` — ${over.length} deeper, first ${Math.round(over[0].m2)} m² at (${over[0].at.map(v => v.toFixed(0)).join(', ')}) ${over[0].deep.toFixed(3)} m` : ''}`)
  console.log(`     (b) in all: ${Math.round(wet).toLocaleString()} m² (inland hollows apart from ①'s water are land, printed, not gated)`)
  if (wetSites.length) { const by = (t) => wetSites.filter(w => w.touches === t), sum = (a) => Math.round(a.reduce((x, w) => x + w.m2, 0)).toLocaleString()
    console.log(`     wet land as ${wetSites.length} region(s): touching ①'s water ${by(true).length} (${sum(by(true))} m²) · apart from it, inland hollows ${by(false).length} (${sum(by(false))} m²)`)
    for (const w of wetSites.sort((a, b) => b.m2 - a.m2).slice(0, 8)) console.log(`       ${Math.round(w.m2).toLocaleString().padStart(6)} m² at (${w.at.map(v => v.toFixed(0)).join(', ')}) · ${w.deep.toFixed(2)} m below LOW at its deepest · ${w.touches ? 'TOUCHES ①\'s water' : 'apart (a hollow)'}`) }
  console.log(`     intertidal (below HIGH, connected; the sand line's, not gated): ${Math.round(tide).toLocaleString()} m²`)
  console.log(`  ${seesShore ? '✅' : '⛔'} the instrument sees the shore: the mask moved ${P50_M} m scores ${Math.round(shifted).toLocaleString()} m² at best, not better`)
  if (!okWet || !seesShore) red++
  const dry = tj.bed?.dry
  if (!dry) console.log(`  (a) NOT CHECKED — terrain.json has no bed.dry (baked before writeBed recorded it; ▶ re-bake the terrain)`)
  else {
    // the coast's edges in a 20 m bucket grid; a dry cell is ON THE LINE within one grid diagonal of one
    const diag = Math.hypot(sx, sz), CELL = 20, segs = new Map()
    for (const r of rings) for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]
      for (let gx = Math.floor(Math.min(a[0], b[0]) / CELL); gx <= Math.floor(Math.max(a[0], b[0]) / CELL); gx++)
        for (let gz = Math.floor(Math.min(a[1], b[1]) / CELL); gz <= Math.floor(Math.max(a[1], b[1]) / CELL); gz++) {
          const key = gx + ',' + gz; if (!segs.has(key)) segs.set(key, []); segs.get(key).push([a, b]) } }
    const near = (x, z) => { for (let gx = Math.floor((x - diag) / CELL); gx <= Math.floor((x + diag) / CELL); gx++) for (let gz = Math.floor((z - diag) / CELL); gz <= Math.floor((z + diag) / CELL); gz++)
      for (const [a, b] of segs.get(gx + ',' + gz) || []) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0
        if (Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) <= diag) return true } return false }
    let onLine = 0, n = 0
    const R = dry.runs, above = dry.aboveHighM, offCells = []
    if (above && above.length !== dry.cells) { console.log(`  ⛔ (a) bed.dry says ${dry.cells} cells and carries ${above.length} heights above HIGH`); red++ }
    for (let q = 0; q < R.length; q += 3) for (let i = R[q + 1]; i <= R[q + 2]; i++, n++) { if (near(X(i), Z(R[q]))) onLine++; else offCells.push({ x: X(i), z: Z(R[q]), above: above ? above[n] : null }) }
    if (n !== dry.cells) { console.log(`  ⛔ (a) bed.dry says ${dry.cells} cells and its runs hold ${n}`); red++ }
    // the deck footprints, each named by the OSM features that lie in it (a feature's vertex inside its ring, or on it within 1 mm)
    const decks = deckFootprints(osm.ground), st = deckStructures(osm.ground)
    const inR = (x, z, r) => { let c = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const [xa, za] = r[a], [xb, zb] = r[b]; if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) c = !c } return c }
    const onEdge = (x, z, r) => r.some((p, a) => { const q = r[(a + 1) % r.length], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / L2)); return Math.hypot(x - p[0] - u * dx, z - p[1] - u * dz) <= 1e-3 })
    const deckOf = (x, z) => decks.on(x, z) ? decks.rings.findIndex(r => inR(x, z, r)) : -1
    // ⛔ without the per-cell heights (a terrain baked before aboveHighM) nothing is listed: every dry cell off the line gates, as before
    const { listed, gated } = above ? sortDry(offCells, deckOf) : { listed: new Map(), gated: offCells }
    if (!above) console.log(`     (a) bed.dry carries no aboveHighM (baked before it was recorded) — no deck listing; every dry cell off the line gates (▶ re-bake the terrain)`)
    for (const [k, cs] of [...listed].sort((a, b) => b[1].length - a[1].length)) {
      const r = decks.rings[k], who = [...st.areas.map(f => ({ ...f, p: f.ring })), ...st.lines.map(f => ({ ...f, p: f.line }))].filter(f => f.p.some(([x, z]) => inR(x, z, r) || onEdge(x, z, r)))
      const hs = cs.map(c => c.above).sort((a, b) => a - b), cx = cs.reduce((t, c) => t + c.x, 0) / cs.length, cz = cs.reduce((t, c) => t + c.z, 0) / cs.length
      console.log(`     (a) UNDER A DECK, listed (not gated): footprint ${k} — ${who.length ? [...who.filter(f => f.name).map(f => `${f.kind} "${f.name}" osm ${f.id}`), ...(who.some(f => !f.name) ? [`${who.filter(f => !f.name).length} unnamed (osm ${who.filter(f => !f.name).slice(0, 3).map(f => f.id).join(', ')}${who.filter(f => !f.name).length > 3 ? ', …' : ''})`] : [])].join(' + ') : 'NO OSM FEATURE FOUND'} · ${cs.length} cell(s) = ${Math.round(cs.length * dry.cellM2).toLocaleString()} m² at (${cx.toFixed(0)}, ${cz.toFixed(0)}) · lidar above HIGH median ${hs[hs.length >> 1].toFixed(2)} m, max ${hs[hs.length - 1].toFixed(2)} m`)
    }
    const off = gated.length, ok = off === 0
    for (const c of gated.slice(0, 8)) console.log(`     (a) dry cell off the line, gated: (${c.x.toFixed(1)}, ${c.z.toFixed(1)})${c.above == null ? '' : ` · lidar ${c.above.toFixed(2)} m above HIGH`}`)
    console.log(`  ${ok ? '✅' : '⛔'} (a) dry bed off the line: ${off.toLocaleString()} cell(s) = ${Math.round(off * dry.cellM2).toLocaleString()} m² (gate 0) · on the line (within ${diag.toFixed(2)} m of a coast edge): ${onLine.toLocaleString()} cell(s) = ${Math.round(onLine * dry.cellM2).toLocaleString()} m², printed · rock kept apart: ${tj.bed.rock?.cells ?? 0}`)
    if (!ok) red++
  }
}
if (red) { console.log(`\n⛔ ${red} failure(s): a dry bed off the line, wet land touching ①'s water deeper than the lidar's accuracy, or a blind instrument.`); process.exit(1) }
if (!checked) { console.log('\n⚠️ NOT CHECKED: no town has its coast, terrain and levels yet.'); process.exit(2) }
console.log(`\n✅ ${checked} town(s): no dry bed off the line, and no wet land touching ①'s water past the lidar's accuracy.`)
