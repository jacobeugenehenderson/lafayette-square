#!/usr/bin/env node
// claims-a-fitted-loop-stays-on-its-road.mjs — DOES EVERY CLOSED-LOOP STREET CHAIN'S LINE STAY ON ITS ROAD?
//
// ⭐ THE CLAIM: skeleton.js step 4b fits a closed loop as a circle (`fitClosedLoopCircle`), as general beziers
// (`fitClosedLoopBezier`, whose comment states Law 2: "never pull the curve off the road"), or leaves it faceted. Whichever
// branch ran, the chain's line must stay on the road OSM draws, the loop's source ways joined into one ring.
// ⭐ THE BOUND IS THE CHAIN'S OWN CARRIAGEWAY, not a constant: the smaller `pavementHW` of the chain's two sides (ribbons
// `measure`). A centreline farther than that from the road it stands for is outside its own carriageway. Both directions
// are judged: every raw vertex to the fitted line, and every point of the fitted line (beziers sampled) to the raw ring.
// So a line that is elsewhere entirely fails too, not only one that bows.
// ⛔ Loud, never skipped: a loop whose source ways do not join into a closed ring, or that has no pavementHW, is named as
// unjudgeable and fails.
// ⭐ MUTANTS (--mutants): (1) one control point of a passing loop moved 2 × its bound across the road → must fail;
// (2) a passing loop handed another loop's source ways → must fail.
//   node checks/claims-a-fitted-loop-stays-on-its-road.mjs [--town=a,b] [--mutants]
// Read-only. Exits 1 on any loop off its road or unjudgeable. Numbers behind it: scratch/footprint-census/closed-loop-fit.mjs.
import { readFileSync, existsSync, readdirSync } from 'fs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const D = 'cartograph/data'
const ribbonsOf = (t) => [`${D}/${t}/clean/ribbons.json`, ...(t === 'lafayette-square' ? ['src/data/ribbons.json'] : [])].find(existsSync)
const towns = arg('town')?.split(',') || readdirSync(D).filter(t => !t.endsWith('-staging') && existsSync(`${D}/${t}/clean/skeleton.json`) && existsSync(`${D}/${t}/raw/osm.json`) && ribbonsOf(t))
const same = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-3
const segD = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz) }
const lineD = (p, L) => { let d = Infinity; for (let i = 0; i + 1 < L.length; i++) d = Math.min(d, segD(p, L[i], L[i + 1])); return d }
// the chain's line: bezier segments sampled (segments[i] runs points[i] → points[i+1]; c1/c2 {x, z}), points otherwise
function lineOf(c) { if (!c.segments?.length) return c.points
  if (c.segments.length !== c.points.length - 1) return null
  const out = [c.points[0]]
  c.segments.forEach((g, i) => { const a = c.points[i], b = c.points[i + 1]; if (g.type !== 'bezier') { out.push(b); return }
    for (let k = 1; k < 32; k++) { const t = k / 32, u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
      out.push({ x: w[0] * a.x + w[1] * g.c1.x + w[2] * g.c2.x + w[3] * b.x, z: w[0] * a.z + w[1] * g.c1.z + w[2] * g.c2.z + w[3] * b.z }) } out.push(b) })
  return out }
function ringOf(ways) { if (!ways.length) return null; const left = ways.map(w => w.coords.map(c => ({ x: c.x, z: c.z }))), out = left.shift()
  while (left.length) { const e = out[out.length - 1], i = left.findIndex(c => same(c[0], e) || same(c[c.length - 1], e)); if (i < 0) return null
    const c = left.splice(i, 1)[0]; out.push(...(same(c[0], e) ? c : c.slice().reverse()).slice(1)) }
  return same(out[0], out[out.length - 1]) ? out : null }
const branchOf = (c) => c.segments?.some(g => g.type === 'bezier') ? 'fitted' : 'faceted'   // which fit ran is not recorded in the frame
function judge(loop, W, bound) {
  const raw = ringOf((loop.sources || []).map(id => W.get(id)).filter(Boolean)), L = lineOf(loop)
  if (!raw) return { why: `its ${loop.sources?.length || 0} source way(s) do not join into a closed ring` }
  if (!L) return { why: `${loop.segments.length} segment(s) for ${loop.points.length} point(s): its line cannot be read` }
  if (!(bound > 0)) return { why: 'no pavementHW: there is no carriageway to bound it' }
  const out = Math.max(...raw.map(p => lineD(p, L))), back = Math.max(...L.map(p => lineD(p, raw)))
  return { out, back, off: Math.max(out, back), ok: Math.max(out, back) <= bound }
}

let bad = 0, mutantsRan = false
for (const town of towns) {
  const S = JSON.parse(readFileSync(`${D}/${town}/clean/skeleton.json`, 'utf8')).streets
  const W = new Map((JSON.parse(readFileSync(`${D}/${town}/raw/osm.json`, 'utf8')).ground?.highway || []).map(f => [f.osmId, f]))
  const M = new Map((JSON.parse(readFileSync(ribbonsOf(town), 'utf8')).streets || []).map(s => [s.skelId, s.measure]))
  const boundOf = (c) => { const m = M.get(c.id); return Math.min(m?.left?.pavementHW ?? NaN, m?.right?.pavementHW ?? NaN) }
  const loops = S.filter(s => s.points?.length >= 4 && same(s.points[0], s.points[s.points.length - 1]))
  const rows = loops.map(c => ({ c, bound: boundOf(c), ...judge(c, W, boundOf(c)) }))
  const off = rows.filter(r => r.why || !r.ok); if (off.length) bad++
  const by = {}; for (const r of rows) { const k = branchOf(r.c); by[k] = (by[k] || 0) + 1 }
  console.log(`${off.length ? '⛔' : '✅'} ${town}: ${loops.length} closed-loop chain(s) (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}) · off their own carriageway ${rows.filter(r => !r.why && !r.ok).length} · unjudgeable ${rows.filter(r => r.why).length}`)
  for (const r of off) console.log(`      ${r.c.id} [${r.c.highway} · ${branchOf(r.c)}]: ${r.why ? `⛔ unjudgeable — ${r.why}` : `raw ring → line ${r.out.toFixed(2)} m · line → raw ring ${r.back.toFixed(2)} m, against its pavementHW ${r.bound.toFixed(2)} m`}`)
  if (process.argv.includes('--mutants')) {
    const pass = rows.filter(r => !r.why && r.ok)
    // (1) move one control point of a passing loop 2 × its bound, sideways to its own line there
    const p1 = pass.find(r => r.c.points.length >= 5)
    let red1 = null; if (p1) { const c = p1.c, i = 1, a = c.points[0], b = c.points[2], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
      const pts = c.points.map((p, k) => k === i ? { x: p.x - dz / l * 2 * p1.bound, z: p.z + dx / l * 2 * p1.bound } : p)
      const j = judge({ ...c, points: pts }, W, p1.bound); red1 = !!j.why || !j.ok }
    if (p1 && !red1) bad++
    if (p1) mutantsRan = true
    console.log(`   mutant · a control point moved 2 × its bound: ${p1 == null ? `not run — no passing loop of ≥ 5 points here (${pass.length} passing)` : red1 ? `RED, as it must be (${p1.c.id})` : '⛔ still GREEN — the check cannot see it'}`)
    // (2) a passing loop handed another loop's source ways
    const [q1, q2] = pass.filter(r => Math.hypot(r.c.points[0].x - (pass[0]?.c.points[0].x ?? 0), r.c.points[0].z - (pass[0]?.c.points[0].z ?? 0)) > 50 || r === pass[0])
    let red2 = null; if (q1 && q2) { const j = judge({ ...q1.c, sources: q2.c.sources }, W, q1.bound); red2 = !!j.why || !j.ok }
    if (q1 && q2 && !red2) bad++
    console.log(`   mutant · a loop handed another loop's source ways: ${red2 == null ? `not run — fewer than two passing loops here (${pass.length})` : red2 ? `RED, as it must be (${q1.c.id} ← ${q2.c.id}'s ways)` : '⛔ still GREEN — the check cannot see it'}`)
  }
}
console.log(bad ? '\n⛔ RED — a closed-loop chain runs outside its own carriageway, or cannot be judged' : '\n✅ GREEN — every closed-loop chain stays within its own carriageway of the road OSM draws')
if (!mutantsRan && process.argv.includes('--mutants')) { console.log('⛔ no town had a loop to mutate — the check was never seen to fail'); process.exit(1) }
process.exit(bad ? 1 : 0)
