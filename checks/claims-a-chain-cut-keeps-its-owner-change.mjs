#!/usr/bin/env node
// CLAIM — WHERE A STREET IS CUT INTO TWO CHAINS, ① KEEPS THE OWNER CHANGE. A chain cut (a skeleton node of degree 2, where
// chain A ends and chain B begins) is not a corner (① has no nodes), but authoring is keyed by owner (skelId · side · segOrd),
// so the two frontages must stay two. On ①'s block rings that means: on each side of the cut, a ring vertex where the
// edge owner changes between A and B. ⛔ A side with no such vertex is two frontages silently merged into one: the operator
// authors A and the width lands on B's run too, or the reverse (`CLAUDE.md` Layer 0 q2).
// ⭐ WHY (Zob, 2026-10-24, the ① seam premise pass): booleanLabelled's Clipper runs without ioPreserveCollinear, so it DROPS a
// vertex that is exactly collinear on the integer grid. Today the change at a cut survives on the stroke's butt poke (the
// sub-ink edge, claims-no-sub-ink-edge-between-two-owners) or on grid rounding that leaves it slightly bent. The seam fix
// removes the poke; this check proves the change is still carried (BRIEF-the-ink-meets-inside-the-ink).
// READS, per town, file only: `ribbons.json` streets (the mint's chains: points + caps.*.degree) and `protopolygon`. A cut =
// a chain end of degree 2 whose point is another chain's end (exact shared vertex, 0.1 mm key, as the mint's own `nodes`).
// A cut is JUDGED where a block-ring EDGE passes within 2ε + 2 grid steps of it (an edge, not a vertex, so a cut that lost
// both change vertices is still judged) (ε off the artifact, the
// grid off lattice.js); a cut no block ring reaches (outside the drawing) is counted, not judged. PRESENT = a vertex there
// whose incoming and outgoing owners are {A, B}, within half the shorter first span at the cut. Each judged cut must show it on both sides (two vertices); fewer is RED.
// Also printed, not judged: label vertices on ① whose turn is under 1° (near-collinear; they survive by grid rounding alone).
//
//   node checks/claims-a-chain-cut-keeps-its-owner-change.mjs [scene…] [--ribbons=path] [--mutants]
//
// ⭐ MUTANT (--mutants): a fixture cut with both change vertices goes GREEN; with one side's label vertex removed (as the
// collinear drop does) it goes RED.
import { readFileSync, existsSync } from 'node:fs'
import { ribbonsPathOf } from '../cartograph/scene.js'
import { scenes } from './_scenes.mjs'
import { CLIP_SCALE as SCALE } from '../src/lib/lattice.js'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const qk = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`

/** { cuts, judged, merged: [{ at, a, b, present }], near } for one ribbons document. */
function judge(j) {
  const P = j.protopolygon, O = P.owners
  if (!(P?.eps > 0)) throw new Error('protopolygon carries no ε (eps) — NOT CHECKED')
  const R = 2 * P.eps + 2 / SCALE
  // the cuts: degree-2 chain ends shared by exactly two different chains
  const at = new Map()
  for (const s of j.streets || []) { const p = s.points; if (!(p?.length >= 2)) continue
    for (const [k, q] of [['start', p[0]], ['end', p[p.length - 1]]]) if (s.caps?.[k]?.degree === 2) {
      const key = qk(q); let m = at.get(key); if (!m) at.set(key, m = { q, ids: new Set(), span: Infinity }); m.ids.add(s.skelId ?? s.name)
      const r = k === 'start' ? p[1] : p[p.length - 2]; m.span = Math.min(m.span, Math.hypot(r[0] - q[0], r[1] - q[1])) } }
  const cuts = [...at.values()].filter(m => m.ids.size === 2)
  // every block-ring vertex, with its in/out owners, on a coarse grid
  const G = new Map(), E = new Map(), cell = (x, z) => `${Math.floor(x / 5)},${Math.floor(z / 5)}`
  let near = 0
  const rings = [...P.blocks.map((r, k) => [r, P.blockLabels[k]]), ...(P.blockHoles || []).flatMap((hs, k) => (hs || []).map((h, i) => [h, P.blockHoleLabels?.[k]?.[i]]))]
  for (const [r, L] of rings) { if (!L) throw new Error('a block ring carries no labels — NOT CHECKED'); const m = r.length
    for (let i = 0; i < m; i++) { const a = O[L[(i - 1 + m) % m]], b = O[L[i]], v = r[i]
      const c = cell(v[0], v[1]); let arr = G.get(c); if (!arr) G.set(c, arr = []); arr.push({ v, a: a?.skelId, b: b?.skelId })
      const w = r[(i + 1) % m]
      for (let x = Math.floor(Math.min(v[0], w[0]) / 5); x <= Math.floor(Math.max(v[0], w[0]) / 5); x++)
        for (let z = Math.floor(Math.min(v[1], w[1]) / 5); z <= Math.floor(Math.max(v[1], w[1]) / 5); z++) { const k = `${x},${z}`; let e = E.get(k); if (!e) E.set(k, e = []); e.push([v, w]) }
      if (a && b && (a.skelId !== b.skelId || a.segOrd !== b.segOrd || a.side !== b.side)) {
        const p = r[(i - 1 + m) % m], q = r[(i + 1) % m]; let t = Math.atan2(q[1] - v[1], q[0] - v[0]) - Math.atan2(v[1] - p[1], v[0] - p[0])
        if (Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) * 180 / Math.PI < 1) near++ } } }
  // the change vertex sits ε/cos(turn/2) off the node, unbounded at a hairpin, so it is searched for within half the shorter
  // first span at the cut (the chains' own geometry, no constant); `reached` above still uses 2ε, the ink's own width
  const around = (q, rad) => { const out = [], n = Math.ceil(rad / 5), cx = Math.floor(q[0] / 5), cz = Math.floor(q[1] / 5)
    for (let x = cx - n; x <= cx + n; x++) for (let z = cz - n; z <= cz + n; z++) for (const e of G.get(`${x},${z}`) || []) if (Math.hypot(e.v[0] - q[0], e.v[1] - q[1]) <= rad) out.push(e)
    return out }
  const segD = (q, [a, b]) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2)) : 0
    return Math.hypot(a[0] + t * dx - q[0], a[1] + t * dz - q[1]) }
  const reached = (q) => { const cx = Math.floor(q[0] / 5), cz = Math.floor(q[1] / 5)
    for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const e of E.get(`${x},${z}`) || []) if (segD(q, e) <= R) return true
    return false }
  let judged = 0; const merged = []
  for (const { q, ids, span } of cuts) {
    const [A, B] = [...ids], here = around(q, Math.max(R, span / 2))
    if (!reached(q)) continue
    judged++
    const present = here.filter(e => e.a !== e.b && ids.has(e.a) && ids.has(e.b)).length
    if (present < 2) merged.push({ at: q, a: A, b: B, present })
  }
  return { cuts: cuts.length, judged, merged, near }
}

let red = 0
const list = arg('ribbons') ? named : scenes('cartograph/data/<scene>/clean/ribbons.json', { has: (s) => existsSync(ribbonsPathOf(s)), label: 'ribbons.json' })
for (const scene of list) {
  const path = arg('ribbons') || ribbonsPathOf(scene), j = JSON.parse(readFileSync(path, 'utf8'))
  if (!j.protopolygon) { console.log(`⛔ ${scene}: NOT CHECKED — ${path} carries no protopolygon`); red++; continue }
  const { cuts, judged, merged, near } = judge(j)
  if (merged.length) red++
  const none = merged.filter(m => !m.present).length
  console.log(`${merged.length ? '⛔' : '✅'} ${scene}: ${cuts} chain cut(s) · ${judged} reach a block ring · ${merged.length} missing the owner change on a side (${none} on both)`
    + ` · ${near} near-collinear label vertex/vertices (turn < 1°, kept by grid rounding)`
    + (merged.length ? `\n     first: ${merged.slice(0, 3).map(m => `(${m.at.map(v => v.toFixed(3)).join(', ')}) ${m.a} | ${m.b} · ${m.present} of 2`).join(' · ')}` : ''))
}

if (process.argv.includes('--mutants')) {
  // a straight street cut at x = 10: chain a (0→10), chain b (10→20); ① block above it (left of travel) and below it
  const eps = 0.005, owners = [{ skelId: 'a', side: 'left', segOrd: 0 }, { skelId: 'b', side: 'left', segOrd: 0 }, { skelId: 'a', side: 'right', segOrd: 0 }, { skelId: 'b', side: 'right', segOrd: 0 }, { skelId: 'z', side: 'right', segOrd: 0 }]
  const streets = [{ skelId: 'a', points: [[0, 0], [10, 0]], caps: { start: { degree: 1 }, end: { degree: 2 } } }, { skelId: 'b', points: [[10, 0], [20, 0]], caps: { start: { degree: 2 }, end: { degree: 1 } } }]
  const up = [[0, eps], [10, eps], [20, eps], [20, 5], [0, 5]], upL = [0, 1, 4, 4, 4]          // edge (0,ε)→(10,ε) is a; (10,ε)→ is b
  const dn = [[20, -eps], [10, -eps], [0, -eps], [0, -5], [20, -5]], dnL = [3, 2, 4, 4, 4]
  const doc = (blocks, labels) => ({ streets, protopolygon: { eps, owners, blocks, blockLabels: labels } })
  const good = judge(doc([up, dn], [upL, dnL])).merged.length
  const dropped = judge(doc([up.filter((_, i) => i !== 1), dn], [upL.filter((_, i) => i !== 1), dnL])).merged.length
  const both = judge(doc([up.filter((_, i) => i !== 1), dn.filter((_, i) => i !== 1)], [upL.filter((_, i) => i !== 1), dnL.filter((_, i) => i !== 1)])).merged.length
  const ok = good === 0 && dropped === 1 && both === 1
  console.log(`   ${ok ? '✅' : '⛔'} mutant fixture · both sides present → ${good} missing · one side's label vertex dropped → ${dropped} missing (must be 1, RED) · both sides dropped → ${both} missing (must be 1, RED)`)
  if (!ok) red++
}

console.log(red ? '\n⛔ RED — a chain cut lost its owner change on ① (two frontages merged), or the fixture failed'
  : '\n✅ GREEN — every chain cut keeps its owner change on both sides of ①')
process.exit(red ? 1 : 0)
