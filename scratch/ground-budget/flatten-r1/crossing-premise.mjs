// crossing-premise.mjs — Boz's amendment 1, before the partition-wide land-use cut is built: does Clipper round the
// crossing of the SAME two segments to the SAME integer point in two separate intersection calls, when the shared segment
// runs in OPPOSITE directions in the two subjects? Two polygons share one slanted edge (A walks it one way, B the other);
// one region crosses both; each is intersected with the region by tileGround's own `intersectRings`. The vertices each
// output puts on the shared line (within one step of it, strictly inside it) must be identical. Random slants, N trials.
//   node scratch/ground-budget/flatten-r1/crossing-premise.mjs [N]   (exit 1 on any trial where they differ)
import { intersectRings } from '../../../src/lib/buildBlockGeometryV2.js'
import { CLIP_SCALE, LATTICE_M } from '../../../src/lib/lattice.js'
const N = +(process.argv[2] || 10000)
let seed = 20261014; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const q = (v) => Math.round(v * CLIP_SCALE)
let bad = 0, crossings = 0
for (let t = 0; t < N; t++) {
  // the shared edge P→Q (lattice points, as every band ring is after a Clipper op), slanted at random
  const P = [q(rnd() * 100) / CLIP_SCALE, q(rnd() * 100) / CLIP_SCALE], ang = rnd() * Math.PI, L = 20 + rnd() * 300
  const Q = [q((P[0] + Math.cos(ang) * L) * 1) / CLIP_SCALE, q((P[1] + Math.sin(ang) * L) * 1) / CLIP_SCALE]
  const nx = -(Q[1] - P[1]) / L, nz = (Q[0] - P[0]) / L, w = 2 + rnd() * 5
  const off = (p, d) => [q((p[0] + nx * d)) / CLIP_SCALE, q((p[1] + nz * d)) / CLIP_SCALE]
  const A = [P, Q, off(Q, w), off(P, w)]                     // left of P→Q: walks P→Q
  const B = [Q, P, off(P, -w), off(Q, -w)]                   // right: walks Q→P (the reverse)
  // a region crossing the shared edge at a random slant, somewhere along it
  const s = 0.2 + rnd() * 0.6, C = [P[0] + (Q[0] - P[0]) * s, P[1] + (Q[1] - P[1]) * s], ca = rnd() * Math.PI, h = 40
  const R = [[C[0] - Math.cos(ca) * h, C[1] - Math.sin(ca) * h], [C[0] + Math.cos(ca) * h, C[1] + Math.sin(ca) * h],
             [C[0] + Math.cos(ca) * h + Math.cos(ca + 1.2) * 400, C[1] + Math.sin(ca) * h + Math.sin(ca + 1.2) * 400], [C[0] - Math.cos(ca) * h + Math.cos(ca + 1.2) * 400, C[1] - Math.sin(ca) * h + Math.sin(ca + 1.2) * 400]]
  const onLine = (rings) => { const out = new Set(), Px = q(P[0]), Py = q(P[1]), Qx = q(Q[0]), Qy = q(Q[1]), dx = Qx - Px, dy = Qy - Py, LL = Math.hypot(dx, dy)
    for (const r of rings) for (const v of r) { const x = q(v[0]), y = q(v[1]), tt = ((x - Px) * dx + (y - Py) * dy) / (LL * LL)
      if (tt <= 0 || tt >= 1) continue
      if (Math.abs((x - Px) * dy - (y - Py) * dx) / LL <= 1) out.add(`${x},${y}`) } return out }
  const a = onLine(intersectRings([A], [R])), b = onLine(intersectRings([B], [R]))
  crossings += a.size
  const same = a.size === b.size && [...a].every(k => b.has(k))
  if (!same) { bad++; if (bad <= 5) console.log(`  ⛔ trial ${t}: A puts ${[...a].join(' ')} · B puts ${[...b].join(' ')}`) }
}
console.log(`${N} trials · ${crossings} crossing vertices on the shared line · ${bad ? `⛔ ${bad} trial(s) where the two sides DIFFER` : 'identical on both sides in every trial'}`)

// ⭐ PART 2 — THE STAMPED CUT (tileGround's `stampTile` + `evidenceByPiece`, the A10 construction where the land use is cut;
// Boz, 2026-10-14/15). A block (iaFull = iA) and two RAW evidence classes — one crossing the block edge, one overlapping it —
// are stamped together, and the piece is cut into its evidence from the stamped rings; the curb is struck from iaFull⁺, cut
// by iA⁺ and by the stamp (`cutByStamp`); asphalt = tile − iA⁺. A curb/asphalt near-miss is the defect, as the check
// defines it — no tolerance anywhere. The mutants are built from the construction's own output: (m1) iA not stamped, (m2) the
// pieces cut from the RAW evidence on iA⁺, (m3) one stamped iA vertex moved one step, (m4) the cut BEFORE the stamp moved
// into it — raw evidence on the unstamped block, which is what the shape froze until 2026-10-15.
import { differenceRings } from '../../../src/lib/buildBlockGeometryV2.js'
import { stampTile, cutByStamp, prepareEvidence, evidenceByPiece } from '../../../src/lib/tileGround.js'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
// the defect, exactly as the check defines it: claims-no-edge-is-drawn-twice's own `nearMisses`, sliced from its source
const _src = readFileSync(fileURLToPath(new URL('../../../checks/claims-no-edge-is-drawn-twice.mjs', import.meta.url)), 'utf8')
const nearMisses = new Function('CLIP_SCALE', 'LATTICE_M', 'STEP', _src.slice(_src.indexOf('export function nearMisses(entries) {'), _src.indexOf('function report(town, pairs, expect) {')).replace('export function', 'function') + '\nreturn nearMisses')(CLIP_SCALE, LATTICE_M, CLIP_SCALE * LATTICE_M)
const key = (v) => `${q(v[0])},${q(v[1])}`
const keysOf = (rings) => new Set(rings.flatMap(r => r.map(key)))
const miss = { NEW: 0, m1: 0, m2: 0, m3: 0, m4: 0 }; let onEdge = 0
for (let t = 0; t < N; t++) {
  const cx = rnd() * 100, cz = rnd() * 100, W = 40 + rnd() * 60, H = 40 + rnd() * 60, rot = rnd() * Math.PI
  const rt = (x, z) => [q(cx + x * Math.cos(rot) - z * Math.sin(rot)) / CLIP_SCALE, q(cz + x * Math.sin(rot) + z * Math.cos(rot)) / CLIP_SCALE]
  const block = [rt(0, 0), rt(W, 0), rt(W, H), rt(0, H)], tile = [rt(-15, -15), rt(W + 15, -15), rt(W + 15, H + 15), rt(-15, H + 15)]
  const a0 = rnd() * W, a1 = rnd() * W, evA = [rt(a0, -30), rt(W + 30, -30), rt(W + 30, H + 30), rt(a1, H + 30)]
  const b0 = rnd() * H, evB = [rt(-30, b0), rt(W * 0.6, b0 + 3), rt(W * 0.6, H + 30), rt(-30, H + 30)]
  const st = { iA: [block], iaFull: [block], iaStamp: [[0, 0, 0, 0]], iaArc: [[null, null, null, null]], iaCorner: [[true, true, true, true]], iaJunction: [[null, null, null, null]],
    luByPiece: ['residential'] }
  const groups = prepareEvidence([{ lu: 'commercial', src: 'osm', rings: [evA] }, { lu: 'park', src: 'osm', rings: [evB] }])
  const { tile: t2, groups: g2 } = stampTile(st, groups)
  const plus = { ...t2, evidenceByPiece: evidenceByPiece(t2.iA, g2, null) }
  const variant = (s2) => {
    const inner = [rt(0.381, 0.381), rt(W - 0.381, 0.381), rt(W - 0.381, H - 0.381), rt(0.381, H - 0.381)]
    const curb = cutByStamp(s2, intersectRings(differenceRings(s2.iaFull, [inner]), s2.iA))
    const asphalt = differenceRings([tile], s2.iA)
    // a pair counts only between the curb and the asphalt, overlapping LONGER than one lattice step: shorter is two edges
    // meeting near a shared vertex at an angle (a touch), not one line drawn twice
    const nm = nearMisses([{ groupKey: 'curb', items: curb }, { groupKey: 'asphalt', items: asphalt }]).filter(x => !x.same && x.m > LATTICE_M)
    if (process.env.DUMP && nm.length && s2 === plus) writeFileSync(process.env.DUMP, JSON.stringify({ t, iA: s2.iA, iaFull: s2.iaFull, ev: s2.evidenceByPiece, curb, asphalt, groups: g2.map(g => g.rings.map(x => x.r)), nm: nm.map(x => x.seg) }))
    return nm
  }
  const check = (name, s2) => { const nm = variant(s2); if (name === 'NEW') onEdge += nm.length; if (nm.length) miss[name]++
    if (process.env.SHOW && name === 'NEW' && nm.length) console.log('   trial', t, 'W', W.toFixed(3), 'H', H.toFixed(3), 'a0', a0.toFixed(4), 'a1', a1.toFixed(4), 'b0', b0.toFixed(4)); if (process.env.SHOW && name === 'NEW' && nm.length) for (const x of nm.slice(0, 6)) console.log('   ', x.a, 'vs', x.b, x.m.toFixed(4), 'm · gap', x.gap.toFixed(3), x.shape, JSON.stringify(x.seg.map(p => p.map(v => +(v).toFixed(4))))) }
  check('NEW', plus)
  check('m1', { ...plus, iA: st.iA })
  check('m2', { ...plus, evidenceByPiece: evidenceByPiece(plus.iA, groups, null) })
  check('m4', { ...st, evidenceByPiece: evidenceByPiece(st.iA, groups, null) })
  { const extra = plus.iA[0].filter(v => !st.iA[0].some(w => key(w) === key(v)))
    const moved = extra.length ? plus.iA[0].map(v => v === extra[0] ? [v[0] + LATTICE_M, v[1]] : v) : plus.iA[0]
    check('m3', { ...plus, iA: [moved] }) }
}
console.log(`stamped tile: ${N} trials · near-miss edge pairs curb/asphalt under the construction: ${onEdge}`)
console.log(`  NEW (the stamped cut): ${miss.NEW} trial(s) with a curb/asphalt near-miss (must be 0)`)
console.log(`  mutants — iA not stamped: ${miss.m1} · pieces cut from the raw evidence: ${miss.m2} · a stamped iA vertex moved one step: ${miss.m3} · the cut before the stamp: ${miss.m4} (each must be RED)`)
process.exit(bad || miss.NEW || !miss.m1 || !miss.m2 || !miss.m3 || !miss.m4 ? 1 : 0)
