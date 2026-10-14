// claims-every-kerb-height-was-given.mjs — DID EVERY ② VERTEX GET ITS HEIGHT FROM THE LINE, OR WAS IT MADE UP?
//
// ⭐⭐ THE INVARIANT: the deformer's carrier height H at every ② vertex (`groundDeformer.mjs#carrierHeights`, imported, never
// replicated) has a GIVEN origin:
//   · 'stamped'  — a straight vertex, its own run's line (`lineHeight.mjs`)
//   · 'tangent'  — a corner arc's own tangent point, stamped, where the straight vertex beside it has no height
//   · 'cap'      — a dead end's cap: ONE coupler, its chain's own (`iaCap` → `capCouplers`, by identity from ①), ONE height, the
//                  chain's end station (Jacob 2026-07-22; Boz 2026-10-13). 'declared-cap:<kind>' on a grade-separated chain
//   · 'blended'  — on a corner arc or a joined span, by arclength between two given heights ("H one continuous value
//                  through the change", the deformer's header)
//   · 'declared:<kind>' — a run that DECLARES no line (a highway stroke's edge, a bridge, the rim), and
//     'declared-corner:<kind>' — a corner beside one with no given height of its own: H eases from the last given height
//                  into the terrain over the deformer's own ease (`carrierHeightAt`), and past it nothing is drawn — the
//                  terrain shows (Boz's rulings, 2026-10-13: (b), with no new number)
// ⛔ 'filled' FAILS, ANYWHERE, with no threshold: a vertex that took its ring neighbours' height. That fallback ran in
// place, left to right, so a whole change landed on one segment — Huron (510, 1308): 3 m over 0.85 m; HPDM 12 m over
// 0.01 m (Brace's census, 3276dceb, scratch/ground-budget/). A filled vertex is the deformer guessing silently.
// ⭐ The towns' runs are stamped by the bake's own stamper (`lineHeight.mjs#stampRunHeights`) over the served shape.json.
//
// Mutations seen RED: listed at the foot, once the fix lands.
//
//   node checks/claims-every-kerb-height-was-given.mjs [scene]            # every baked town, or one
//   SLAB_DIR=<slab> node checks/claims-every-kerb-height-was-given.mjs <scene>
// Read-only. Exits 1 on any vertex whose height was not given; 2 if the self-test fails.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { carrierHeights, carrierHeightAt, hOfRunIn, buildDeformer } from '../cartograph/groundDeformer.mjs'
import { lineHeights, stampRunHeights } from '../cartograph/lineHeight.mjs'
import { loadSceneTerrain } from '../cartograph/terrainLoad.js'
import { waterLevels } from '../cartograph/waterLevel.mjs'
import { ribbonsPathOf } from '../cartograph/scene.js'
import { readBakeDesign } from '../cartograph/lookDesign.mjs'

const GIVEN = (o) => o === 'stamped' || o === 'tangent' || o === 'blended' || o === 'cap' || /^declared(-corner|-cap)?:(highway|bridge|rim)$/.test(o ?? '')

// ⛔⛔ SELF-TEST FIRST, on rings whose answer is known by construction. Runs: 0 at h 0, 1 at h 3, 2 a highway (no line),
// 3 a run whose label names no at-grade chain ('unknown': no line, and NOT a declared kind).
{
  const fails = []
  const runs = [{ h: [0, 0], poly: [[0, 0], [100, 0]] }, { h: [3, 3], poly: [[0, 0], [100, 0]] }, { h: null, noLine: 'highway', poly: [[0, 0], [100, 0]] }, { h: null, noLine: 'unknown', poly: [[0, 0], [100, 0]] }]
  const hOfRun = (ri) => runs[ri]?.h ? runs[ri].h[0] : null
  const noLineOf = (ri) => runs[ri]?.noLine ?? null
  const caps = [{ h: 7 }, { h: null, noLine: 'bridge' }]                    // cap 0: an at-grade dead end at 7 m · cap 1: a footway bridge's
  const line = (n) => Array.from({ length: n }, (_, i) => [i * 10, (i * 7) % 3])    // a ring's vertices, 10 m apart
  const run = (name, { arc, stamp, cap = null }, want) => {
    let r, threw = null
    try { r = carrierHeights({ ring: line(arc.length), arc, stamp, hOfRun, noLineOf, capOf: (i) => (cap?.[i] != null ? caps[cap[i]] : null) }) } catch (e) { threw = e.message }
    const verdict = want({ r, threw })
    if (verdict !== true) fails.push(`${name}: ${verdict}`)
  }
  const noFill = ({ r, threw }) => threw ? `threw: ${threw}` : !r.H ? 'no H' : r.origin.every(GIVEN) || `origins ${JSON.stringify(r.origin)}`
  // an arc between two stamped straights: blended, as it always was
  run('a fillet between two lines', { arc: [null, null, 1, 1, null, null], stamp: [0, 0, null, null, 1, 1] }, noFill)
  // two ABUTTING arcs, their shared tangent unstamped (Huron tile 10): one span, blended from 0 to 3, no step on one segment
  run('two abutting arcs, no stamp between', { arc: [null, null, 1, 1, 2, 2, null, null], stamp: [0, 0, null, null, null, null, 1, 1] }, ({ r, threw }) => {
    const v = noFill({ r, threw }); if (v !== true) return v
    const d = []; for (let i = 1; i < 7; i++) d.push(Math.abs(r.H[i + 1] - r.H[i]))
    return Math.max(...d) < 0.75 || `the change lands on one segment: |ΔH| per segment ${d.map(x => x.toFixed(2)).join(' ')}` })
  // two abutting arcs whose shared tangent IS stamped: each arc blends on its own
  run('two abutting arcs, stamped tangent', { arc: [null, null, 1, 1, 2, 2, null, null], stamp: [0, 0, null, 0, 1, null, 1, 1] }, noFill)
  // an ALL-ARC ring (a roundabout): its arcs' stamped tangent points are the given heights
  run('an all-arc ring', { arc: [1, 1, 1, 2, 2, 2], stamp: [0, null, 0, 1, null, 1] }, noFill)
  // a straight on a highway edge: declared, no height drawn
  run('a highway edge', { arc: [null, null, null, null], stamp: [0, 2, 2, 0] }, ({ r, threw }) => { const v = noFill({ r, threw }); if (v !== true) return v
    return (r.origin[1] === 'declared:highway' && r.H[1] == null) || `the highway vertex: ${r.origin[1]}, H ${r.H[1]}` })
  // a corner arc beside a highway edge, its own tangent stamped: the tangent gives the height there
  run('an arc beside a highway, tangent stamped', { arc: [null, 1, 1, 1, null], stamp: [2, 0, null, 0, 0] }, ({ r, threw }) => { const v = noFill({ r, threw }); if (v !== true) return v
    return r.origin[1] === 'tangent' || `the arc's first vertex: ${r.origin[1]}` })
  // …and with NO tangent stamp: no height on that side, so none is drawn (never the neighbours')
  run('an arc beside a highway, no tangent', { arc: [null, 1, 1, 1, null], stamp: [2, null, null, null, 0] }, ({ r, threw }) => threw ? `threw: ${threw}`
    : (r.origin.slice(1, 4).every(o => o === 'declared-corner:highway') && r.H.slice(1, 4).every(h => h == null)) || `origins ${JSON.stringify(r.origin)} H ${JSON.stringify(r.H)}`)
  // a straight on a run with no line that is NOT a declared kind: it is no exemption — blended through, as a joined span
  run('a run with no line, not declared', { arc: [null, null, null, null], stamp: [0, 3, 3, 1] }, ({ r, threw }) => { const v = noFill({ r, threw }); if (v !== true) return v
    return (r.origin[1] === 'blended' && r.origin[2] === 'blended') || `origins ${JSON.stringify(r.origin)}` })
  // a DEAD END: two legs at 0 and 3 and a cap between them — the cap takes its chain's ONE height, not a blend of the legs
  run('a dead end\'s cap', { arc: [null, null, null, null, null, null], stamp: [0, 0, null, null, 1, 1], cap: [null, null, 0, 0, null, null] }, ({ r, threw }) => { const v = noFill({ r, threw }); if (v !== true) return v
    return (r.origin[2] === 'cap' && r.origin[3] === 'cap' && r.H[2] === 7 && r.H[3] === 7) || `the cap: ${r.origin.slice(2, 4)} H ${r.H.slice(2, 4)}` })
  // a rounded cap is eased: its vertices lie on an ARC, and the cap still gives them its one height
  run('a rounded cap (on an arc)', { arc: [null, null, 1, 1, 1, null], stamp: [0, 0, null, null, null, 1], cap: [null, null, 0, 0, 0, null] }, ({ r, threw }) => { const v = noFill({ r, threw }); if (v !== true) return v
    return r.H.slice(2, 5).every(h => h === 7) || `the cap: H ${r.H.slice(2, 5)}` })
  // a footway bridge inside a block (HPDM tile 49): both sides and both caps grade-separated — a DECLARED absence, no throw
  run('a footway bridge with its caps', { arc: [null, null, null, null, null, null], stamp: [2, 2, null, 2, 2, null], cap: [null, null, 1, null, null, 1] }, ({ r, threw }) => threw ? `threw: ${threw}`
    : (r.H == null && r.origin[2] === 'declared-cap:bridge' && r.origin.every(GIVEN)) || `H ${JSON.stringify(r.H)} origins ${JSON.stringify(r.origin)}`)
  // a short unstamped straight between two lines: one span, blended
  run('an unstamped straight', { arc: [null, null, null, null], stamp: [0, null, null, 1] }, noFill)
  // a ring with no line anywhere, every run declaring none: a declared absence, not a throw
  run('a ring of highway only', { arc: [null, null, null], stamp: [2, 2, 2] }, ({ r, threw }) => threw ? `threw: ${threw}` : (r.H == null && r.origin.every(o => o === 'declared:highway')) || `H ${JSON.stringify(r.H)} origins ${JSON.stringify(r.origin)}`)
  // a ring with no line anywhere because a vertex is UNSTAMPED: refused by name
  run('a ring with no line, unstamped', { arc: [null, null, null], stamp: [2, null, 2] }, ({ threw }) => !!threw || 'did not throw')
  // THE EASE (carrierHeightAt): a given 10 m at p, a declared end at q 50 m on, terrain 0, ease B 5 m — 10 at p, 5 at
  // 2.5 m, the terrain at 5 m, nothing past it; and between two given heights it stays the plain line
  { const p = [0, 0], q = [50, 0], raw = () => 0, B = 5, at = (u) => carrierHeightAt({ h: 10 }, { h: null, side: { back: { h: 10, s: 50 }, fwd: { h: null, s: Infinity } } }, p, q, u, raw, B)
    const got = [at(0), at(2.5 / 50), at(5 / 50), at(0.5)]
    if (!(Math.abs(got[0] - 10) < 1e-9 && Math.abs(got[1] - 5) < 1e-9 && Math.abs(got[2]) < 1e-9 && got[3] === null)) fails.push(`the ease: H at 0 / 2.5 / 5 / 25 m = ${got.join(' / ')}, want 10 / 5 / 0 / null`)
    // a short declared stretch (4 m) between given 10 and 0: continuous, between them, meeting each end exactly
    const sp = { h: null, side: { back: { h: 10, s: 0 }, fwd: { h: 0, s: 4 } } }
    const h = [0, 0.25, 0.5, 0.75, 1].map(u => carrierHeightAt({ h: 10 }, { h: 0 }, p, [4, 0], u, raw, B))
    if (h.join() !== [10, 7.5, 5, 2.5, 0].join()) fails.push(`two given ends: ${h.join(' ')}`)
    const k = [0, 0.5, 1].map(u => carrierHeightAt({ h: null, side: { back: { h: 10, s: 2 }, fwd: { h: 0, s: 2 } } }, { h: null, side: { back: { h: 10, s: 4 }, fwd: { h: 0, s: 0 } } }, p, [2, 0], u, () => 3, B))
    if (!k.every(v => v != null && v <= 10 && v >= 0)) fails.push(`a short declared stretch between 10 and 0: ${k.join(' ')}`) }
  // THE CAP'S HEIGHT (lineHeight.mjs capLine): a chain running 0 → 200 m up a 1:10 ramp — its START cap reads the line at
  // its start, its END cap at its end (by the end the cap names, never by the station nearest a vertex)
  { const LH = lineHeights({ streets: [{ skelId: 'ramp', points: [[0, 0], [100, 0], [200, 0]] }], raw: (x) => x / 10, sigma: 5 })
    const a = LH.capLine('ramp', 'start'), b = LH.capLine('ramp', 'end'), mid = LH.heightAt('ramp', [100, 0])
    if (!(a < mid && mid < b && b - a > 15)) fails.push(`capLine: start ${a?.toFixed(2)} · middle ${mid?.toFixed(2)} · end ${b?.toFixed(2)} — the cap does not read its own end`)
    let threw = false; try { LH.capLine('ramp', 'middle') } catch { threw = true }
    if (!threw) fails.push('capLine: a cap naming no end was accepted') }
  // A COAST CAP (no chain end): the stamper gives it the water line at its own point, and refuses it with no water record
  { const LH = lineHeights({ streets: [], raw: () => 0, sigma: 5 }), water = { lineAt: (x) => 1 + x / 100 }
    const tiles = [{ runs: [], capCouplers: [{ skelId: '__water__', at: [50, 0] }] }]
    stampRunHeights({ tiles, LH, water, streets: [], scene: 'self-test' })
    if (tiles[0].capCouplers[0].h !== 1.5) fails.push(`a coast cap at x 50 took ${tiles[0].capCouplers[0].h}, not the water line there (1.5)`)
    let threw = false; try { stampRunHeights({ tiles, LH, water: null, streets: [], scene: 'self-test' }) } catch { threw = true }
    if (!threw) fails.push('a coast cap with no water record was stamped') }
  // A SHAPE POURED BEFORE A PARALLEL ARRAY: the deformer REFUSES it by name — never reads a missing iaCap as "no caps" (every
  // cap blended between its legs) or a missing iaArc as "no arcs" (every corner straightened)
  { const sq = [[-5, -5], [5, -5], [5, 5], [-5, 5]], full = { ring: [[-10, -10], [10, -10], [10, 10], [-10, 10]], iA: [sq], iaFull: [sq], iaStamp: [[0, 0, 0, 0]],
      iaArc: [[null, null, null, null]], iaCap: [[null, null, null, null]], capCouplers: [], runs: [{ poly: [...sq, sq[0]], h: [0, 1, 2, 3, 0] }] }
    const build = (t) => buildDeformer({ tiles: [t], raw: () => 0, limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 }, bands: { curb: [], walk: [], lawn: [] } })
    try { build(full) } catch (e) { fails.push(`a whole shape was refused: ${e.message}`) }
    for (const [k, says] of [['iaCap', 'predates the cap couplers'], ['iaArc', 'no iaArc'], ['iaStamp', 'no iaStamp']]) {
      const { [k]: _, ...t } = full; let msg = null
      try { build(t) } catch (e) { msg = e.message }
      if (!msg?.includes(says)) fails.push(`a shape with no ${k} was ${msg ? `refused, but not by name ("${msg.slice(0, 90)}")` : 'accepted'}`) }
    let msg = null; try { build({ ...full, iaCap: [[null, null]] }) } catch (e) { msg = e.message }
    if (!msg?.includes('iaCap is 2 long')) fails.push(`a ring whose iaCap is not its length was ${msg ? `refused, but not by name ("${msg.slice(0, 90)}")` : 'accepted'}`) }
  if (fails.length) { console.error(`⛔ SELF-TEST FAILED — carrierHeights makes heights up where none was given:\n   ${fails.join('\n   ')}`); process.exit(2) }
  console.log('self-test: every synthetic ring takes only given heights')
}

const only = process.argv[2] || null
const slabOf = (s) => process.env.SLAB_DIR && only ? process.env.SLAB_DIR : join(ROOT, 'public', 'baked', s)
const list = only ? [only] : scenes('public/baked/<scene>/shape.json', { label: 'baked shape' })
const fail = []
for (const scene of list) {
  const sPath = join(slabOf(scene), 'shape.json')
  if (!existsSync(sPath)) { fail.push(`${scene}: no baked shape.json at ${sPath}`); continue }
  const tiles = JSON.parse(readFileSync(sPath, 'utf8')).tiles || []
  const T = loadSceneTerrain(scene)
  if (!T) { fail.push(`${scene}: no terrain — the line's heights cannot be stamped`); continue }
  const design = readBakeDesign(scene, scene, 'claims-every-kerb-height-was-given')
  const sigma = Number.isFinite(design.groundLineSigmaM) && design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
  const ribbons = JSON.parse(readFileSync(ribbonsPathOf(scene), 'utf8'))
  let st
  try { st = stampRunHeights({ tiles, LH: lineHeights({ streets: ribbons.streets, raw: T.getElevationRaw, sigma }), water: T.water ? waterLevels(T.water) : null, streets: ribbons.streets, scene }) }
  catch (e) { fail.push(`${scene}: the line's heights cannot be stamped — ${e.message}`); continue }
  const tally = {}, bad = [], refused = []
  let rings = 0, verts = 0, absent = 0
  tiles.forEach((t, ti) => {
    if (!(t?.ring?.length >= 3) || !t.iA?.length || !t.iaFull?.length || !t.iaStamp?.length) return
    const runs = t.runs || [], hOfRun = hOfRunIn(runs), noLineOf = (ri) => runs[ri]?.noLine ?? null, tcaps = t.capCouplers || []
    const name = (ri) => { const r = runs[ri]; return r ? `${r.skelId}/${r.side}/${r.segOrd}` : 'no stamp' }
    t.iaFull.forEach((ring, ri) => {
      if (!(ring?.length >= 3)) return
      rings++; verts += ring.length
      const arc = t.iaArc?.[ri] || [], stamp = t.iaStamp?.[ri] || []
      let r
      const ic = t.iaCap?.[ri] || []
      try { r = carrierHeights({ ring, arc, stamp, hOfRun, noLineOf, capOf: (i) => (ic[i] != null ? tcaps[ic[i]] : null) }) } catch (e) { refused.push(`tile ${ti} ring ${ri}: ${e.message}`); return }
      if (!r.H) absent++
      r.origin.forEach((o, v) => { tally[o ?? 'none'] = (tally[o ?? 'none'] || 0) + 1
        if (!GIVEN(o)) bad.push(`tile ${ti} ring ${ri} v ${v} (${ring[v].map(c => c.toFixed(1)).join(', ')}) ${o ?? 'no origin'} · ${arc[v] != null ? `arc ${arc[v]}` : name(stamp[v])}`) })
    })
  })
  const by = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')
  console.log(`  ${scene.padEnd(18)} ${rings} ② rings, ${verts} vertices: ${by}${absent ? ` · ${absent} ring(s) with no height (declared)` : ''} · runs without a line: ${JSON.stringify(st.why)}`)
  if (refused.length) fail.push(`${scene}: ${refused.length} ring(s) REFUSED by name:\n     ${refused.slice(0, 8).join('\n     ')}`)
  if (bad.length) fail.push(`${scene}: ${bad.length} ② vertex(es) whose height was NOT GIVEN:\n     ${bad.slice(0, 10).join('\n     ')}${bad.length > 10 ? `\n     … ${bad.length - 10} more` : ''}`)
}
if (fail.length) { console.error(`\n⛔ A KERB HEIGHT WAS MADE UP:\n   ${fail.join('\n   ')}`); process.exit(1) }
console.log('\n✅ every ② vertex takes a given height, or declares none')
