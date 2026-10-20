// t2-tips.mjs <scene> — T2's dead-end addition (Boz for Jacob, 2026-10-19): the dead end gets its thickness in ①
// (`PIPELINE` step 3: centrelines stroked to a hairline before the punch-out, so a spur is a NOTCH in its block, not a slit).
// OURS (`mintProtopolygon`, tileGround.js): no Clipper offset — each chain is stroked BY HAND: the right pass at +ε, the left
// pass back at −ε, each vertex moved along its central-difference normal scaled to ε (no miter correction), and the two
// passes joined at each end by ONE straight edge through the end point: a BUTT end, no extension. A degree-1 end's cap edge
// is marked `cap`, its vertices `tipEnd`; side and srcIdx ride every vertex's stamp. ε = the pour's (frozen `protopolygon.eps`).
// THE CHAINS are the mint's own input, rebuilt as derive.js builds it: `tessellateAdaptive` over clean/skeleton.json's
// points + segments, per ribbons street; each tip is first checked against the frozen ① (a tip-stamped ① vertex within
// 1.5 ε of the end), so the comparison runs on the chains the pour actually stroked.
// CLIPPER2: the same chain as an OPEN path, delta ε, JoinType.Miter, EndType Butt · Square · Round, Z = the chain point
// index + 1 (the srcIdx the mint stamps). Per tip and end type:
//   closed  — one closed ring holds a point ½ε back from the end (the notch has an end, not an open slit)
//   ext     — how far past the end point the tip reaches
//   tipV    — output vertices at the tip (within 2ε of the end and at or past it − ε)
//   z       — tip vertices whose Z names the END point (srcIdx carried) / some other point / none (0)
//   sides   — whether the tip's two sides can be told apart by Z (ours: `side` on the stamp)
//   ② keeps — tip edges ② does not fold: offsetRingByRects folds any edge shorter than 2ε − 2/CLIP_SCALE (`subInkLen`)
//             into the corner it sits in, so a tip edge under that never reaches ② or the cap
import { readFileSync, writeFileSync } from 'fs'
import { ClipperOffset, JoinType, EndType } from 'clipper2-ts'
import { tessellateAdaptive } from '../../cartograph/derive.js'
import { mintProtopolygon } from './tileGround.probe.mjs'
import { CLIP_SCALE } from '../../src/lib/lattice.js'
import { ribbonsPath } from '../../checks/_scenes.mjs'
const scene = process.argv[2]
const D = `cartograph/data/${scene}/clean`
const rb = JSON.parse(readFileSync(ribbonsPath(scene), 'utf8')), sk = JSON.parse(readFileSync(`${D}/skeleton.json`, 'utf8'))
const PP = rb.protopolygon, EPS = PP.eps, SUBINK = 2 * EPS - 2 / CLIP_SCALE, S2 = 1e5
const skById = new Map((sk.streets || []).map(s => [s.id, s]))
const ENDS = { Butt: EndType.Butt, Square: EndType.Square, Round: EndType.Round }
// frozen ① tip vertices: ring vertex whose LABEL's owner is a tipEnd of (skelId, end)
const frozenTip = new Map()
PP.rings.forEach((r, ri) => r.forEach((p, j) => { const o = PP.owners[PP.labels[ri][j]]; if (o?.tipEnd) { const k = `${o.skelId}|${o.tipEnd}`; (frozenTip.get(k) || frozenTip.set(k, []).get(k)).push(p) } }))
const blockTip = new Set()
;(PP.blocks || []).forEach((r, ri) => r.forEach((p, j) => { const o = PP.owners[PP.blockLabels[ri][j]]; if (o?.tipEnd) blockTip.add(`${o.skelId}|${o.tipEnd}`) }))
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const T = { tips: 0, chainsMissing: 0, inFrozen: 0, notInFrozen: 0, reachBlock: 0, mismatch: [] }
const agg = {}; for (const k of ['ours', ...Object.keys(ENDS)]) agg[k] = { n: 0, closed: 0, ext: [], tipV: [], zEnd: 0, zOther: 0, zNone: 0, keep: [], sides: k === 'ours' }
const sites = []
for (const s of rb.streets) for (const end of ['start', 'end']) {
  if (s.caps?.[end]?.degree !== 1) continue
  T.tips++
  const k0 = skById.get(s.skelId); if (!k0) { T.chainsMissing++; continue }
  const P = tessellateAdaptive((k0.points || []).map(q => (Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])), k0.segments)
  if (!(P?.length >= 2)) { T.chainsMissing++; continue }
  const iE = end === 'start' ? 0 : P.length - 1, iN = end === 'start' ? 1 : P.length - 2
  const E = P[iE], dir = [E[0] - P[iN][0], E[1] - P[iN][1]], dl = Math.hypot(...dir); dir[0] /= dl; dir[1] /= dl
  const fz = frozenTip.get(`${s.skelId}|${end}`) || []
  const near = fz.length ? Math.min(...fz.map(p => Math.hypot(p[0] - E[0], p[1] - E[1]))) : Infinity
  if (near <= 1.5 * EPS) T.inFrozen++; else { T.notInFrozen++; if (fz.length && T.mismatch.length < 6) T.mismatch.push(`${s.skelId} ${end}: nearest frozen tip vertex ${near.toFixed(3)} m`) ; continue }
  if (blockTip.has(`${s.skelId}|${end}`)) T.reachBlock++
  const isTip = (p) => Math.hypot(p[0] - E[0], p[1] - E[1]) <= 2 * EPS && ((p[0] - E[0]) * dir[0] + (p[1] - E[1]) * dir[1]) >= -EPS
  const measure = (key, rings, zOf) => {
    const A = agg[key]; A.n++
    const back = [E[0] - dir[0] * EPS / 2, E[1] - dir[1] * EPS / 2]
    if (rings.some(r => pip(back[0], back[1], r))) A.closed++
    let ext = -Infinity, tv = 0, keep = 0
    for (const r of rings) for (let j = 0; j < r.length; j++) { const p = r[j], q = r[(j + 1) % r.length]
      if (!isTip(p)) continue
      tv++; ext = Math.max(ext, (p[0] - E[0]) * dir[0] + (p[1] - E[1]) * dir[1])
      if (zOf) { const z = zOf(r, j); if (!z) A.zNone++; else if (z - 1 === iE) A.zEnd++; else A.zOther++ }
      if (isTip(q) && Math.hypot(q[0] - p[0], q[1] - p[1]) >= SUBINK) keep++ }
    A.ext.push(ext); A.tipV.push(tv); A.keep.push(keep)
    return rings
  }
  // ours: the mint itself, on this one chain
  const M = mintProtopolygon({ streets: [{ ...s, points: P, hard: P.hard || null }], eps: EPS })
  const oursR = measure('ours', M.rings, null)
  // ours carries identity per EDGE (the label of the edge leaving each vertex), so the tip's question is the cap EDGE's label
  { const A = agg.ours; let capOk = false
    M.rings.forEach((r, ri) => r.forEach((p, j) => { const q = r[(j + 1) % r.length], o = M.owners[M.labels[ri][j]]
      if (isTip(p) && isTip(q) && o?.cap && o.tipEnd === end && o.skelId === s.skelId) capOk = true }))
    if (capOk) A.zEnd++; else A.zNone++ }
  const site = { skelId: s.skelId, end, E, dir, ours: oursR }
  for (const [nm, et] of Object.entries(ENDS)) {
    const o = P[iE], path = P.map((p, i) => ({ x: Math.round((p[0] - o[0]) * S2), y: Math.round((p[1] - o[1]) * S2), z: i + 1 }))
    const co = new ClipperOffset(2.0); co.addPath(path, JoinType.Miter, et); const sol = []; co.execute(EPS * S2, sol)
    const R = sol.map(r => r.map(q => [q.x / S2 + o[0], q.y / S2 + o[1]]))
    measure(nm, R, (r, j) => sol[R.indexOf(r)][j].z || 0)
    site[nm] = R
  }
  if (sites.length < 8) sites.push(site)
}
const pct = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }
const L = []; const say = (x = '') => { L.push(x); console.log(x) }
say(`T2 dead-end tips · ${scene} · ε ${EPS} m (frozen) · ② folds tip edges < ${SUBINK.toFixed(4)} m`)
say(`degree-1 ends ${T.tips} · chain not rebuilt ${T.chainsMissing} · tip found in frozen ① ${T.inFrozen} · not (swallowed, stencilled, or moved) ${T.notInFrozen} · tip reaches a block ring ${T.reachBlock}`)
for (const m of T.mismatch) say(`  ⚠ ${m}`)
say(`per tip (measured on the ${T.inFrozen} found in ①):            closed   ext p50/max (mm)   tip vertices p50/max   Z end / other / none   sides by Z   tip edges ② keeps p50/max`)
say(`  (ours: the Z column is per TIP — its cap EDGE labelled cap + tipEnd + this skelId / not; Clipper2: per tip vertex)`)
for (const [k, A] of Object.entries(agg)) say(`  ${k.padEnd(7)} ${String(A.n).padStart(5)}   ${String(A.closed).padStart(6)}   ${(pct(A.ext, .5) * 1000).toFixed(2)} / ${(Math.max(...A.ext) * 1000).toFixed(2)}`.padEnd(48) +
  `${pct(A.tipV, .5)} / ${Math.max(...A.tipV)}`.padEnd(23) + `${A.zEnd} / ${A.zOther} / ${A.zNone}`.padEnd(23) + `${A.sides ? 'yes (stamp)' : 'no'}`.padEnd(13) + `${pct(A.keep, .5)} / ${Math.max(...A.keep)}`)
writeFileSync(new URL(`./t2-tips-${scene}.out`, import.meta.url), L.join('\n') + '\n')
writeFileSync(new URL(`./t2-tips-sites-${scene}.json`, import.meta.url), JSON.stringify(sites))
