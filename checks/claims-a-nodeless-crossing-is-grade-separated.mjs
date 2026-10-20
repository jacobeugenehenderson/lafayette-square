#!/usr/bin/env node
// claims-a-nodeless-crossing-is-grade-separated.mjs — WHERE TWO OSM STREET WAYS CROSS IN 2D WITHOUT A SHARED NODE, DOES OSM
// PUT THEM ON DIFFERENT GRADES?
//
// ⭐ THE CLAIM (cartograph/ARCHITECTURE.md, "Grade separation is a frame fact"): the face walk (`extractFaces`) is a
// shared-vertex graph, so a 2D crossing with no shared node is read as a grade separation. That holds only if OSM never
// draws two SAME-GRADE ways crossing without a node. This check reads each town's raw/osm.json and names every crossing that
// breaks it.
//   · the ways judged: the source ways of clean/skeleton.json's streets (what the face graph is built from). Every other
//     highway way (paths, footways…) is counted beside it, reported, not failed.
//   · a crossing: two segments of two different ways meeting in their interiors, with no vertex of either within EPS_M.
//   · grade: `layer` (an unparseable value reads 0), with bridge as +½ and tunnel as −½, so a bridge at layer 0 is still
//     off a plain way at layer 0. The same reading as skeleton.js `gradeFacts`.
// ⭐ MUTANTS (--mutants): (1) a shared-node crossing has one way's node moved 0.3 m off both ways' lines → must be named; (2) a nodeless
// crossing that OSM separates has the off-grade way's tags cleared → must be named. A check never seen to fail proves nothing.
//   node checks/claims-a-nodeless-crossing-is-grade-separated.mjs [--town=a,b] [--mutants] [--all]
// ⭐ CLAIM 2, THE FRAME: the face walk reads skeleton.json's chains, so the claim must hold there too. A nodeless crossing of
// two CHAINS whose source ways there OSM puts on one grade is a crossing the frame made. A chain's line is its bezier
// `segments` where it has them (sampled), its `points` otherwise. Mutant: the same node move, on the chains.
// Read-only. Exits 1 on any same-grade nodeless crossing of two street ways, or of two chains.
import { readFileSync, existsSync, readdirSync } from 'fs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const ALL = process.argv.includes('--all'), EPS_M = 0.01
const D = 'cartograph/data'
const towns = arg('town')?.split(',') || readdirSync(D).filter(t => !t.endsWith('-staging') && existsSync(`${D}/${t}/clean/skeleton.json`) && existsSync(`${D}/${t}/raw/osm.json`))
const NOT_BUILT = new Set(['proposed', 'construction', 'planned', 'abandoned', 'razed', 'demolished', 'dismantled'])   // skeleton.js drops these
const grade = (t) => (parseInt(t?.layer, 10) || 0) + ((t?.bridge && t.bridge !== 'no') ? 0.5 : 0) - ((t?.tunnel && t.tunnel !== 'no') ? 0.5 : 0)
const X = (a, b, c, d) => { const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx; if (Math.abs(den) < 1e-12) return null
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + t * rx, z: a.z + t * rz } : null }
const near = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < EPS_M

// every 2D crossing between ways of `ways` ([{osmId, tags, coords}]): nodeless ones, and how many share a node
function crossings(ways) {
  const C = 25, grid = new Map(), out = []; let shared = 0
  ways.forEach((w, wi) => { const c = w.coords; for (let k = 0; k + 1 < c.length; k++) { const a = c[k], b = c[k + 1]
    for (let x = Math.floor(Math.min(a.x, b.x) / C); x <= Math.floor(Math.max(a.x, b.x) / C); x++) for (let z = Math.floor(Math.min(a.z, b.z) / C); z <= Math.floor(Math.max(a.z, b.z) / C); z++) {
      const key = x + ',' + z; (grid.get(key) || grid.set(key, []).get(key)).push([wi, k]) } } })
  const seen = new Set()
  for (const cell of grid.values()) for (let i = 0; i < cell.length; i++) for (let j = i + 1; j < cell.length; j++) {
    const [wa, ka] = cell[i], [wb, kb] = cell[j]; if (wa === wb) continue
    const id = wa < wb ? `${wa}:${ka}|${wb}:${kb}` : `${wb}:${kb}|${wa}:${ka}`; if (seen.has(id)) continue; seen.add(id)
    const A = ways[wa].coords, B = ways[wb].coords, a = A[ka], b = A[ka + 1], c = B[kb], d = B[kb + 1]
    // a crossing AT a shared node: two segments meet at a common vertex (each way's node there) — the shared-node case
    if ((near(a, c) || near(a, d) || near(b, c) || near(b, d))) { shared++; continue }
    const p = X(a, b, c, d); if (!p) continue
    if ([a, b, c, d].some(v => near(v, p))) continue
    out.push({ p, a: ways[wa], b: ways[wb], same: grade(ways[wa].tags) === grade(ways[wb].tags) })
  }
  return { out, shared }
}
// mutant (1): a crossing at a shared INTERIOR node of two ways at one grade, with that node moved on one way
function moveSharedNode(ways) {
    for (const w of ways) for (let k = 1; k + 1 < w.coords.length; k++) { const v = w.coords[k]
      for (const u of ways) { if (u === w) continue; const j = u.coords.findIndex((q, jj) => jj > 0 && jj + 1 < u.coords.length && near(q, v)); if (j < 0) continue
        // the two ways must actually CROSS there (u's neighbours on opposite sides of w's two segments' line), not just touch
        const side = (p) => Math.sign((w.coords[k + 1].x - w.coords[k - 1].x) * (p.z - w.coords[k - 1].z) - (w.coords[k + 1].z - w.coords[k - 1].z) * (p.x - w.coords[k - 1].x))
        if (side(u.coords[j - 1]) * side(u.coords[j + 1]) >= 0 || grade(u.tags) !== grade(w.tags)) continue
        // move u's node 0.3 m off BOTH lines (diagonally): along w only it stays on w; along u only, u's line still runs
        // through the old node, on w's vertex — neither is a crossing between nodes
        const nrm = (p, q) => { const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l] }
        const nu = nrm(u.coords[j - 1], u.coords[j + 1]), nw = nrm(w.coords[k - 1], w.coords[k + 1]), off = { x: v.x + 0.3 * (nu[0] + nw[0]), z: v.z + 0.3 * (nu[1] + nw[1]) }
        return ways.map(x => x === u ? { ...u, coords: u.coords.map((q, jj) => jj === j ? off : q) } : x) } }
  return null
}
const tagStr = (t) => `layer ${t.layer ?? 0}${t.bridge && t.bridge !== 'no' ? ' bridge' : ''}${t.tunnel && t.tunnel !== 'no' ? ' tunnel' : ''}`
const name = (w) => `way ${w.osmId} (${w.tags.name || '(unnamed)'} · ${w.tags.highway} · ${tagStr(w.tags)})`

let bad = 0
for (const town of towns) {
  const sk = JSON.parse(readFileSync(`${D}/${town}/clean/skeleton.json`, 'utf8'))
  const ids = new Set(sk.streets.flatMap(s => s.sources || []))
  const raw = (JSON.parse(readFileSync(`${D}/${town}/raw/osm.json`, 'utf8')).ground?.highway || []).filter(f => f.coords?.length >= 2 && !NOT_BUILT.has(f.tags?.highway))
  const streets = raw.filter(f => ids.has(f.osmId))
  if (!streets.length) { console.log(`⛔ ${town}: no skeleton street's source way is in raw/osm.json — nothing was checked`); bad++; continue }
  const S = crossings(streets), same = S.out.filter(c => c.same)
  if (same.length) bad++
  console.log(`${same.length ? '⛔' : '✅'} ${town}: ${streets.length} street way(s) · nodeless crossings ${S.out.length}, OSM separates ${S.out.length - same.length}, SAME GRADE ${same.length}`)
  for (const c of same) console.log(`      (${c.p.x.toFixed(1)}, ${c.p.z.toFixed(1)}): ${name(c.a)} × ${name(c.b)}`)
  // ⭐ CLAIM 2 — THE FRAME: the face walk reads skeleton.json's CHAINS, not the ways. A nodeless crossing of two chains whose
  // source ways there (the nearest source way of each) OSM puts on one grade is a crossing the frame MADE — OSM has none.
  const W = new Map(); for (const f of raw) (W.get(f.osmId) || W.set(f.osmId, []).get(f.osmId)).push(f)   // one id can carry several features (a multipolygon's rings)
  const segD = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz) }
  const localWay = (ch, p) => { let best = null, bd = Infinity; for (const id of ch.src) for (const w of W.get(id) || []) { for (let k = 0; k + 1 < w.coords.length; k++) { const d = segD(p, w.coords[k], w.coords[k + 1]); if (d < bd) { bd = d; best = w } } } return best ? { w: best, d: bd } : null }
  // ⭐ a chain's LINE is its `segments` where it has them (skeleton.js step 4b: a curving run is ONE cubic bezier between
  // two control points, so `points` alone is the chord, not the road) — sampled here at ≤ 0.5 m; `points` otherwise
  // (skeleton.json: segments[i] runs points[i] → points[i+1]; a bezier carries c1/c2 as {x, z})
  const lineOf = (c) => { if (!c.segments?.length) return c.points
    if (c.segments.length !== c.points.length - 1) throw new Error(`${c.id}: ${c.segments.length} segment(s) for ${c.points.length} point(s) — the frame's line cannot be read`)
    const out = [c.points[0]]
    c.segments.forEach((g, i) => { const a = c.points[i], b = c.points[i + 1]
      if (g.type !== 'bezier') { out.push(b); return }
      const L = Math.hypot(g.c1.x - a.x, g.c1.z - a.z) + Math.hypot(g.c2.x - g.c1.x, g.c2.z - g.c1.z) + Math.hypot(b.x - g.c2.x, b.z - g.c2.z), n = Math.max(2, Math.ceil(L / 0.5))
      for (let k = 1; k < n; k++) { const t = k / n, u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
        out.push({ x: w[0] * a.x + w[1] * g.c1.x + w[2] * g.c2.x + w[3] * b.x, z: w[0] * a.z + w[1] * g.c1.z + w[2] * g.c2.z + w[3] * b.z }) }
      out.push(b) })
    return out }
  const chains = sk.streets.filter(c => c.points?.length >= 2).map(c => ({ osmId: c.id, tags: { highway: c.highway }, coords: lineOf(c), src: c.sources || [], gs: !!c.gradeSeparated, curved: !!c.segments?.length }))
  const frame = (chs) => crossings(chs).out.map(c => { const la = localWay(c.a, c.p), lb = localWay(c.b, c.p); return { ...c, la, lb, made: !la || !lb || grade(la.w.tags) === grade(lb.w.tags) } }).filter(c => c.made)
  const F = frame(chains)
  if (F.length) bad++
  console.log(`   ${F.length ? '⛔' : '✅'} the frame: ${chains.length} chain(s) · nodeless chain crossings whose source ways OSM puts on ONE grade (a crossing the frame made) ${F.length} · both chains at grade, so both in the face walk: ${F.filter(c => !c.a.gs && !c.b.gs).length}`)
  for (const c of F) console.log(`      (${c.p.x.toFixed(1)}, ${c.p.z.toFixed(1)}): ${c.a.osmId}${c.a.gs ? ' [gradeSeparated]' : ''} × ${c.b.osmId}${c.b.gs ? ' [gradeSeparated]' : ''} · their ways there: ${c.la ? `${name(c.la.w)} ${c.la.d.toFixed(2)} m off` : 'none'} × ${c.lb ? `${name(c.lb.w)} ${c.lb.d.toFixed(2)} m off` : 'none'}`)
  if (ALL) { const W = crossings(raw), ws = W.out.filter(c => c.same)
    console.log(`   every highway way (reported, not failed): ${raw.length} way(s) · nodeless crossings ${W.out.length}, same grade ${ws.length} · by class pair: ${Object.entries(ws.reduce((m, c) => { const k = [c.a.tags.highway, c.b.tags.highway].sort().join('×'); m[k] = (m[k] || 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(' · ')}`) }
  if (process.argv.includes('--mutants')) {
    const m1 = moveSharedNode(streets)
    const r1 = m1 ? crossings(m1).out.filter(c => c.same).length : null
    const red1 = r1 != null && r1 > same.length; if (!red1) bad++
    console.log(`   mutant · a crossing's shared node moved off both lines: ${r1 == null ? '⛔ no shared-node crossing found to mutate' : red1 ? `RED, as it must be (same grade ${same.length} → ${r1})` : `⛔ still ${r1} — the check cannot see it`}`)
    const fm = moveSharedNode(chains), rf = fm ? frame(fm).length : null, redF = rf != null && rf > F.length; if (!redF) bad++
    console.log(`   mutant · the frame: a chain's shared node moved off both lines: ${rf == null ? '⛔ no shared-node chain crossing found to mutate' : redF ? `RED, as it must be (made ${F.length} → ${rf})` : `⛔ still ${rf} — the check cannot see it`}`)
    // (2) a separated nodeless crossing: clear the off-grade way's grade tags
    const sep = S.out.find(c => !c.same)
    let r2 = null; if (sep) { const offW = grade(sep.a.tags) !== 0 ? sep.a : sep.b, flat = { ...offW, tags: { ...offW.tags, layer: undefined, bridge: undefined, tunnel: undefined } }
      if (grade(flat.tags) === grade((offW === sep.a ? sep.b : sep.a).tags)) r2 = crossings(streets.map(x => x === offW ? flat : x)).out.filter(c => c.same).length }
    const red2 = r2 != null && r2 > same.length; if (!red2) bad++
    console.log(`   mutant · a separated crossing's off-grade way loses its tags: ${r2 == null ? '⛔ no separated crossing to mutate (or both ways off grade)' : red2 ? `RED, as it must be (same grade ${same.length} → ${r2})` : `⛔ still ${r2} — the check cannot see it`}`)
  }
}
console.log(bad ? `\n⛔ RED — a nodeless crossing (of OSM street ways, or of the frame's chains) that OSM puts on one grade: it is not, by itself, a grade separation` : '\n✅ GREEN — every nodeless crossing, of the ways and of the chains, is one OSM puts on two grades')
process.exit(bad ? 1 : 0)
