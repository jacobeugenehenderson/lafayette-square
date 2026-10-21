#!/usr/bin/env node
// CLAIM — WHERE THERE IS NO CORNER, THE BAND BENDS (`RIBBONS §1` invariant 1, "the corner is the band BENT", scoped by
// b2d5a549 to the curb, the diagonal corner and every non-corner; Jacob, 2026-10-18: "when sidewalk meets sidewalk it also just
// continues smoothly"; "why doesn't grass bend with sidewalk on non-corners?"). Every eased arc that is not PADDED — a bend
// (one street), a corner the operator unmarked, a junction where no walk reaches the road (`notCorner`, Boz's ruling,
// 2026-10-18) — is the ordinary band bent through it: no pad, no ramp, each strip at its own depth and continuous round the
// turn; a leg ends on it only where the ladder's DEPTHS change (50a64997, 6a64c44b).
// READS the paint (authoring loaded, the norm the pour would freeze now): at every unpadded arc (the painter's `cornerArcs`;
// its points tangent to tangent read off the frozen tile's `iaFull` + `iaArc`), the strips met casting inward from the road edge — at both tangents and at three stations along the
// arc. ASSERTS: along the arc the strips come in the tangents' own order, each boundary between the two tangents' depths
// (5 cm); an arc whose two tangents already differ in order (a frontage change on the bend) is NOT JUDGED, counted.
//   node checks/claims-a-bend-bends-the-band.mjs [scene…] [--painter=<tileGround copy>]
// SEEN RED: this branch before 50a64997 (the corner mark ended a leg at every arc vertex: Huron 190 of 365) and before
// 6a64c44b (an owner change with equal depths still ended one). At 6a64c44b, Huron: 9 of 181, at 5 places — the land use
// starting 0.1–0.4 m off its tangents' depth mid-arc, and one lawn start 8 cm off; cause not established.
// Also RED: the painter with its not-corner pass off (each such arc padded with walk to the kerb).
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { feed } from '../scratch/_proto-feed.mjs'
import { ribbonScenes } from './_scenes.mjs'
const painter = process.argv.find(a => a.startsWith('--painter='))?.slice(10)
const { buildTileGround } = await import(painter ? pathToFileURL(resolve(painter)).href : '../src/lib/tileGround.js')
const { resolveCurbCutNorm } = await import('../cartograph/curb-cut-norm.mjs'), { readSources } = await import('../cartograph/sources.js')
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const TOL = 0.05, STEP = 0.02, REACH = 8
const pip = (x, z, r) => { let w = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) w = !w } return w }
let red = false
for (const scene of named.length ? named : ribbonScenes()) {
  const f = feed(scene); if (!f) { red = true; continue }
  const src = readSources(scene), nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
  const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
  let R; try { R = buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth,
    blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
    cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1 }) } finally { console.log = pl; console.warn = pw }
  const layers = [['curb', [...(R.curb || []), ...(R.curbCut || [])]], ['lawn', Object.values(R.treelawnByLu || {}).flat()], ['walk', R.sidewalk || []], ['lu', Object.values(R.luByClass || {}).flat()]]
    .map(([k, rs]) => [k, rs.map(r => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return { r, bb: [a, b, c, d] } })])
  const what = (x, z) => { for (const [k, rs] of layers) if (rs.some(o => x >= o.bb[0] && x <= o.bb[2] && z >= o.bb[1] && z <= o.bb[3] && pip(x, z, o.r.r ?? o.r))) return k; return null }
  // the profile inward from P along n: the strips met, each with the depth it starts at (stopped at the land use)
  const profile = (P, n) => { const out = []; for (let t = STEP / 2; t < REACH; t += STEP) { const m = what(P[0] + n[0] * t, P[1] + n[1] * t)
      if (!m) continue; if (!out.length || out[out.length - 1][0] !== m) out.push([m, t]); if (m === 'lu') break } return out }
  // each unpadded arc's own points, tangent to tangent, read off the FROZEN tile (`iaFull` + `iaArc`), not the painter's record
  const ptsOf = (a) => { const t = R.protoShapeTiles?.[a.tile], ring = t?.iaFull?.[a.si], arc = t?.iaArc?.[a.si]; if (!ring || !arc) return null
    const n = ring.length, ix = []; for (let i = 0; i < n; i++) if (arc[i] === a.arc) ix.push(i); if (ix.length < 2) return null
    let f0 = ix[0]; if (ix.length < n && arc[(f0 - 1 + n) % n] === a.arc) { f0 = ix.find(i => arc[(i - 1 + n) % n] !== a.arc) ?? f0 }
    const out = []; for (let k = 0, i = f0; k < n && arc[i] === a.arc; k++, i = (i + 1) % n) out.push(ring[i]); return out }
  // a no-street arc (the shore, the rim) carries no band at all — nothing to bend; not judged
  const arcs = (R.cornerArcs || []).filter(a => !a.pad && a.kind !== 'nostreet').map(a => ({ ...a, arcPts: ptsOf(a) })).filter(a => a.arcPts?.length >= 2)
  let judged = 0, skipped = 0
  const bad = []
  for (const a of arcs) {
    const A = a.arcPts, cum = [0]; for (let i = 1; i < A.length; i++) cum.push(cum[i - 1] + Math.hypot(A[i][0] - A[i - 1][0], A[i][1] - A[i - 1][1]))
    const L = cum[cum.length - 1]; if (!(L > 0.2)) continue
    const stationAt = (s) => { let i = 1; while (i < A.length - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), U = A[i - 1], V = A[i]
      const P = [U[0] + (V[0] - U[0]) * t, U[1] + (V[1] - U[1]) * t], d = [V[0] - U[0], V[1] - U[1]], l = Math.hypot(...d) || 1, n = [-d[1] / l, d[0] / l]
      // inward: the side whose first step is ground (curb), not road
      const inw = what(P[0] + n[0] * 0.05, P[1] + n[1] * 0.05) ? n : [-n[0], -n[1]]
      return profile(P, inw) }
    const t0 = stationAt(0.01), t1 = stationAt(L - 0.01)
    const ord = (p) => p.map(x => x[0]).join('>')
    if (!t0.length || ord(t0) !== ord(t1)) { skipped++; continue }
    judged++
    for (const s of [0.25, 0.5, 0.75]) { const p = stationAt(L * s)
      if (ord(p) !== ord(t0)) { bad.push(`(${A[0][0].toFixed(1)}, ${A[0][1].toFixed(1)}) ${a.kind}${a.notCorner ? ' (not a corner)' : ''}: at ${Math.round(s * 100)}% of the arc the strips run ${ord(p)}, at its tangents ${ord(t0)}`); break }
      const off = p.findIndex((x, i) => x[1] < Math.min(t0[i][1], t1[i][1]) - TOL || x[1] > Math.max(t0[i][1], t1[i][1]) + TOL)
      if (off >= 0) { bad.push(`(${A[0][0].toFixed(1)}, ${A[0][1].toFixed(1)}) ${a.kind}${a.notCorner ? ' (not a corner)' : ''}: at ${Math.round(s * 100)}% of the arc the ${p[off][0]} starts ${p[off][1].toFixed(2)} m in, its tangents ${t0[off][1].toFixed(2)} / ${t1[off][1].toFixed(2)} m`); break } }
  }
  console.log(`── ${scene}   ${bad.length ? `⛔ RED — ${bad.length} unpadded arc(s) where the band does not bend through` : '✅ every unpadded arc bends the band through'}`)
  console.log(`   ${arcs.length} unpadded arc(s) (${arcs.filter(a => a.kind === 'bend').length} bends · ${arcs.filter(a => a.notCorner).length} not a corner) · ${judged} judged · ${skipped} not judged (tangents differ, or no ground)`)
  for (const b of process.env.LIST ? bad : bad.slice(0, 8)) console.log(`   ✗ ${b}`)
  if (bad.length) red = true
}
process.exit(red ? 1 : 0)
