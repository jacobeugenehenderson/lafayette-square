// THE FIX'S GATE. Rebuilds the shape pass in-process (⛔ writes nothing, bakes
// nothing) and checks the dead-end bulb against Jacob's ruling of 2026-08-12:
//
//   the bulb is a SYMMETRIC circle on the road's REAL centerline
//   radius = (left + right) / 2
//   centre = the chain displaced (right − left) / 2 toward the wider side
//
// Three gates:
//   CONTROL   the reconstructed producer input must reproduce the FROZEN
//             artifact's own radii under the OLD rule (max) — otherwise the
//             harness is measuring a different map and nothing below counts.
//   EXACT     every SYMMETRIC cap must come out byte-identical: left === right
//             ⇒ mean === max and displacement === 0. Free, and strong.
//   TANGENT   for every cap, both legs' asphalt edges must be exactly `hw` from
//             the bulb centre — that IS "no shoulder step", stated as a
//             distance (Layer 0: never an area test).
//
//   node scratch/tessel-cap-bulb-verify.mjs [scene]
//
// ⛔ Runs with the scene's authored state: overlay.json measures over the
// ribbons defaults, design.json blockCustoms. A run with blockCustoms:null is
// measuring the wrong map.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { buildTileGround, capCentre } from '../src/lib/tileGround.js'

const scene = process.argv[2] || 'lafayette-square'
const o = console.log
const R = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const ribbonsPath = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const ribbons = R(ribbonsPath)
const overlay = (() => { try { return R(`cartograph/data/${scene}/clean/overlay.json`) } catch { return { streets: {} } } })()
const design = (() => { try { return R(`public/looks/${scene}/design.json`) } catch { return {} } })()
const nb = (() => { try { return R(`cartograph/data/${scene}/neighborhood_boundary.json`) } catch { return null } })()
const shapePath = `public/baked/${scene}/shape.json`
const frozen = fs.existsSync(shapePath) ? R(shapePath) : null
if (frozen) o(`frozen shape.json sha256 ${crypto.createHash('sha256').update(fs.readFileSync(shapePath)).digest('hex').slice(0, 10)}`)

// ── the producer's input: overlay measures over the ribbons defaults ────────
// The overlay is the skelId-keyed SHAPE authoring channel (ORIENTATION §3); the
// live app merges it before calling buildTileGround, which is why ribbons.json
// alone reads 5.49/5.49 where the map is authored 5.49/6.9269. Reconstructing it
// here is a CLAIM — the CONTROL gate below is what makes it evidence.
let nMerged = 0
const streets = ribbons.streets.map(s => {
  const ov = overlay.streets?.[s.skelId || s.name]
  const om = ov?.measure && (Number.isFinite(ov.measure?.left?.pavementHW) || Number.isFinite(ov.measure?.right?.pavementHW)) ? ov.measure : null
  if (!om) return s
  nMerged++
  return { ...s, measure: { ...s.measure, ...om } }
})
const live = { ...ribbons, streets }
o(`scene ${scene}: ${streets.length} streets, ${nMerged} carrying an authored overlay measure`)

const opts = {
  stencil: nb?.boundary || null,
  curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth : 0.1524,
  blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null,
  emitArtifact: true,
}
const q = console.log; console.log = () => {}
const built = buildTileGround(live, opts)
console.log = q
const tiles = built._shapeArtifact?.tiles || built._shapeArtifact || []
o(`built ${tiles.length} shape tiles (frozen artifact has ${frozen?.tiles?.length ?? '—'})`)

const H = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const stBySkel = new Map(streets.map(s => [s.skelId || s.name, s]))
const caps = []
for (const t of tiles) for (const rt of (t.roundTips || [])) if (rt.skelId) caps.push(rt)
o(`round caps built: ${caps.length}`)

// ── CONTROL ────────────────────────────────────────────────────────────────
let ctlOK = 0, ctlBad = []
if (frozen) {
  const frozenByKey = new Map()
  for (const t of frozen.tiles || []) for (const rt of (t.roundTips || [])) if (rt.skelId) frozenByKey.set(`${rt.skelId}|${rt.capEnd}`, rt)
  for (const rt of caps) {
    const f = frozenByKey.get(`${rt.skelId}|${rt.capEnd}`)
    if (!f) { ctlBad.push([`${rt.skelId}|${rt.capEnd}`, 'not in the frozen artifact']); continue }
    const s = stBySkel.get(rt.skelId)
    const l = +(s?.measure?.left?.pavementHW || 0), r = +(s?.measure?.right?.pavementHW || 0)
    const oldRule = Math.max(l, r)
    if (Math.abs(oldRule - f.hw) < 1e-9) ctlOK++
    else ctlBad.push([`${rt.skelId}|${rt.capEnd}`, `reconstructed max ${oldRule.toFixed(4)} ≠ frozen hw ${(+f.hw).toFixed(4)}`])
  }
  o(`\nCONTROL — reconstructed input reproduces the frozen radii under the OLD rule (max): ${ctlOK}/${caps.length}`)
  for (const b of ctlBad.slice(0, 8)) o(`   ⛔ ${b[0]}: ${b[1]}`)
} else o('\nCONTROL — skipped, no frozen artifact for this scene')

// ── EXACT + TANGENT ────────────────────────────────────────────────────────
let sym = 0, symBad = 0, asym = 0, tanBad = []
const rows = []
for (const rt of caps) {
  const s = stBySkel.get(rt.skelId)
  const l = +(s?.measure?.left?.pavementHW || 0), r = +(s?.measure?.right?.pavementHW || 0)
  const want = (l + r) / 2, disp = Math.abs(r - l) / 2
  const c = capCentre(rt)
  const moved = H(c, rt.p)
  const symmetric = Math.abs(l - r) < 1e-9
  // TANGENT: the two legs' asphalt edges are the chain offset by l and r; the
  // bulb centre must sit `hw` from each. Distance from centre to the left edge
  // = l + (signed displacement toward right) and to the right edge = r − it.
  const dL = l + (moved * (r > l ? 1 : r < l ? -1 : 0)), dR = r - (moved * (r > l ? 1 : r < l ? -1 : 0))
  const tanErr = Math.max(Math.abs(dL - rt.hw), Math.abs(dR - rt.hw))
  if (symmetric) { sym++; if (Math.abs(rt.hw - Math.max(l, r)) > 1e-12 || moved > 1e-12) symBad++ } else asym++
  if (tanErr > 1e-9) tanBad.push([`${rt.skelId}|${rt.capEnd}`, tanErr])
  rows.push({ k: `${rt.skelId}|${rt.capEnd}`, l, r, hw: +rt.hw, want, moved, disp, symmetric, tanErr })
}
o(`\nEXACT — symmetric caps (left === right): ${sym}, of which NOT byte-identical to the old rule: ${symBad}`)
o(`        asymmetric caps (the class this fixes): ${asym}`)
o(`TANGENT — caps where a leg's asphalt edge is not exactly hw from the bulb centre: ${tanBad.length}`)
for (const b of tanBad.slice(0, 8)) o(`   ⛔ ${b[0]}: off by ${b[1].toExponential(2)} m`)

o(`\n  cap                                 left    right   radius   displaced   was (max)   step removed`)
for (const x of rows.sort((a, b) => (b.disp - a.disp)).slice(0, 12)) {
  o(`  ${x.k.padEnd(34)} ${x.l.toFixed(3).padStart(6)} ${x.r.toFixed(3).padStart(8)} ${x.hw.toFixed(3).padStart(8)} ${x.moved.toFixed(3).padStart(11)} ${Math.max(x.l, x.r).toFixed(3).padStart(11)} ${(x.disp * 2).toFixed(3).padStart(14)}`)
}
// ⛔ A check that passes because it measured NOTHING is the failure mode Layer 0
// names. Refuse to be green on an empty population.
if (!caps.length) { o('\n⛔ INSTRUMENT FAILURE — 0 round caps built. NOT MEASURED; this is not a pass.'); process.exit(2) }
if (frozen && !ctlOK) { o('\n⛔ INSTRUMENT FAILURE — the CONTROL matched 0 caps, so the reconstructed input is not the producer\'s. NOT MEASURED.'); process.exit(2) }
const red = ctlBad.length || symBad || tanBad.length
o(`\n${red ? '⛔ RED' : '✅ GREEN'} — control ${ctlBad.length} bad · symmetric drift ${symBad} · tangency ${tanBad.length}`)
process.exit(red ? 1 : 0)
