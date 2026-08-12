#!/usr/bin/env node
/**
 * APRON FORENSIC part 3 — are the bare degree-2 nodes CORRECTLY bare?
 *
 * A junctionMap node with 2 legs and no continuity/deTaper/apron falls through
 * BOTH constructions: the E3 pass never enters it (:3548's filter excludes it)
 * and the THRU pass only fires at geometric degree >= 3 (:3565) at an INTERIOR
 * chain vertex — a 2-chain end-to-end join is degree 2 and is nobody's vertex.
 * So the two butt-capped strokes just meet. That is only correct if there is
 * nothing to construct: same width, same tangent.
 *
 * This measures both, per bare deg-2 node, with the scene's authored widths.
 * ⚠️ segOrd is approximated here as the count of INTERIOR vertices whose
 * geometric degree >= 3 (tileGround's own nodeDeg rule); the exact producer is
 * `resolveChainSegmentation`, which is not exported. Reported as approximate.
 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json'), 'utf8'))
const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json'), 'utf8'))
const bc = design.blockCustoms || null
const streets = (ribbons.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const key = p => p[0].toFixed(2) + ',' + p[1].toFixed(2)

const nodeDeg = new Map()
for (const s of streets) for (let i = 0; i < s.points.length; i++) {
  const k = key(s.points[i]); nodeDeg.set(k, (nodeDeg.get(k) || 0) + ((i === 0 || i === s.points.length - 1) ? 1 : 2))
}
const ixCount = new Map()
for (const s of streets) { let n = 0; for (let i = 1; i < s.points.length - 1; i++) if ((nodeDeg.get(key(s.points[i])) || 0) >= 3) n++; ixCount.set(s.skelId || s.name, n) }
const byId = new Map(streets.map(s => [s.skelId || s.name, s]))
const hw = (sk, side, segOrd) => {
  const s = byId.get(sk); if (!s) return null
  const base = Math.max(0, s.measure?.[side]?.pavementHW || 0)
  const c = bc?.[sk]?.[side]?.[segOrd]
  return (c && Number.isFinite(c.pavementHW)) ? Math.max(0, c.pavementHW) : base
}
const tanAt = (s, end) => {
  const p = s.points, a = end === 'start' ? p[0] : p[p.length - 1], b = end === 'start' ? p[1] : p[p.length - 2]
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
  return [dx / L, dy / L]   // points INTO the chain, away from the node
}

const nodes = (ribbons.junctionMap?.nodes || [])
const bare = nodes.filter(n => (n.legs || []).length === 2 && !(n.continuity?.length || n.deTaper?.length || n.apron))
let clean = 0, wStep = 0, bend = 0, both = 0, unresolved = 0, thru = 0
const hist = []
for (const n of bare) {
  const [L1, L2] = n.legs
  if (L1.end === 'through' || L2.end === 'through') { thru++; continue }
  const s1 = byId.get(L1.chain), s2 = byId.get(L2.chain)
  if (!s1 || !s2) { unresolved++; continue }
  const so1 = L1.end === 'start' ? 0 : (ixCount.get(L1.chain) || 0)
  const so2 = L2.end === 'start' ? 0 : (ixCount.get(L2.chain) || 0)
  // widest side mismatch — the two chains' side labels are point-order relative,
  // so compare the SET of half-widths, not left-to-left.
  const A = [hw(L1.chain, 'left', so1), hw(L1.chain, 'right', so1)].sort((a, b) => a - b)
  const B = [hw(L2.chain, 'left', so2), hw(L2.chain, 'right', so2)].sort((a, b) => a - b)
  const dw = Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]))
  const t1 = tanAt(s1, L1.end), t2 = tanAt(s2, L2.end)
  // legs point away from the node; a straight-through join has t1·t2 = -1
  const ang = 180 - Math.acos(Math.max(-1, Math.min(1, t1[0] * t2[0] + t1[1] * t2[1]))) * 180 / Math.PI
  const isW = dw >= 0.02, isB = ang >= 3
  if (isW && isB) both++; else if (isW) wStep++; else if (isB) bend++; else clean++
  if (isW || isB) hist.push([dw, ang, L1.chain, L2.chain])
}
console.log(`BARE degree-2 junctionMap nodes (no continuity, no deTaper, no apron): ${bare.length}`)
console.log(`  of which a 'through' leg (not an end-to-end join): ${thru}   unresolved chain: ${unresolved}`)
console.log(`  ✅ clean  (Δw < 2 cm AND bend < 3°)     ${clean}`)
console.log(`  ⛔ width step only  (Δw >= 2 cm)        ${wStep}`)
console.log(`  ⛔ bend only        (>= 3°)             ${bend}`)
console.log(`  ⛔ BOTH                                 ${both}`)
hist.sort((a, b) => (b[0] * 10 + b[1]) - (a[0] * 10 + a[1]))
console.log(`\n  worst 12 (Δw m, bend °):`)
for (const h of hist.slice(0, 12)) console.log(`    Δw ${h[0].toFixed(2).padStart(5)} m · bend ${h[1].toFixed(1).padStart(5)}°   ${h[2]} ↔ ${h[3]}`)
// For scale: the SAME two measures on the 23 deg-2 nodes that DO carry a spec.
const spec = nodes.filter(n => (n.legs || []).length === 2 && (n.continuity?.length || n.deTaper?.length || n.apron))
let sClean = 0, sDirty = 0
for (const n of spec) {
  const [L1, L2] = n.legs
  if (L1.end === 'through' || L2.end === 'through') continue
  const s1 = byId.get(L1.chain), s2 = byId.get(L2.chain); if (!s1 || !s2) continue
  const so1 = L1.end === 'start' ? 0 : (ixCount.get(L1.chain) || 0), so2 = L2.end === 'start' ? 0 : (ixCount.get(L2.chain) || 0)
  const A = [hw(L1.chain, 'left', so1), hw(L1.chain, 'right', so1)].sort((a, b) => a - b)
  const B = [hw(L2.chain, 'left', so2), hw(L2.chain, 'right', so2)].sort((a, b) => a - b)
  const dw = Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]))
  const t1 = tanAt(s1, L1.end), t2 = tanAt(s2, L2.end)
  const ang = 180 - Math.acos(Math.max(-1, Math.min(1, t1[0] * t2[0] + t1[1] * t2[1]))) * 180 / Math.PI
  if (dw < 0.02 && ang < 3) sClean++; else sDirty++
}
console.log(`\n  CONTROL — the 23 SPEC'd deg-2 nodes by the same two tests: ${sDirty} dirty · ${sClean} clean`)
