#!/usr/bin/env node
// The bend row's RED arcs (checks/claims-a-bend-bends-the-band.mjs), each traced COORDINATE → TILE RING → ARC OWNER, never by
// street graph (Boz, 2026-10-19). For each: the tile whose frozen ring holds the arc (by geometry, checked against the painter's
// record), the runs (skelId|side|segOrd) stamped on the arc's vertices and its two flank edges, the operator's authoring on each
// (blockCustoms entry, the corner's cornerCornerRadiusOverrides entry by iaArcKey, blockLandUse on the tile ring), and the full
// strip profile at the tangents and five stations. Read-only; builds the ground in memory, writes nothing.
//   node --max-old-space-size=8192 scratch/perp-depths/bends/bend-owners.mjs [scene=huron]
import { feed } from '../../_proto-feed.mjs'
import { blockKeyFromRing } from '../../../src/lib/buildBlockGeometryV2.js'
const { buildTileGround } = await import('../../../src/lib/tileGround.js')
const { resolveCurbCutNorm } = await import('../../../cartograph/curb-cut-norm.mjs'), { readSources } = await import('../../../cartograph/sources.js')
const scene = process.argv[2] || 'huron'
const TOL = 0.05, STEP = 0.02, REACH = 8
const pip = (x, z, r) => { let w = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) w = !w } return w }
const f = feed(scene); if (!f) process.exit(1)
const src = readSources(scene), nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
let R; try { R = buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth,
  blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
  cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true }) } finally { console.log = pl; console.warn = pw }
const bc = f.blockCustoms || {}, ccro = f.cornerCornerRadiusOverrides || {}, blu = f.blockLandUse || {}
console.log(`${scene}: authoring loaded — blockCustoms streets ${Object.keys(bc).length} · corner entries ${Object.keys(ccro).length} · blockLandUse entries ${Object.keys(blu).length}`)
const layers = [['curb', [...(R.curb || []), ...(R.curbCut || [])]], ['lawn', Object.values(R.treelawnByLu || {}).flat()], ['walk', R.sidewalk || []], ['lu', Object.values(R.luByClass || {}).flat()]]
  .map(([k, rs]) => [k, rs.map(r => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of (r.r ?? r)) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return { r: r.r ?? r, bb: [a, b, c, d] } })])
const luOf = Object.entries(R.luByClass || {}).map(([k, rs]) => [k, rs.map(r => r.r ?? r)])
const what = (x, z) => { for (const [k, rs] of layers) if (rs.some(o => x >= o.bb[0] && x <= o.bb[2] && z >= o.bb[1] && z <= o.bb[3] && pip(x, z, o.r))) return k; return null }
const luClassAt = (x, z) => luOf.find(([, rs]) => rs.some(r => pip(x, z, r)))?.[0] ?? null
const profile = (P, n) => { const out = []; for (let t = STEP / 2; t < REACH; t += STEP) { const m = what(P[0] + n[0] * t, P[1] + n[1] * t)
    if (!m) continue; if (!out.length || out[out.length - 1][0] !== m) out.push([m, t, m === 'lu' ? luClassAt(P[0] + n[0] * (t + 0.05), P[1] + n[1] * (t + 0.05)) : null]); if (m === 'lu') break } return out }
const T = R.protoShapeTiles || []
const ixOf = (a) => { const t = T[a.tile], ring = t?.iaFull?.[a.si], arc = t?.iaArc?.[a.si]; if (!ring || !arc) return null
  const n = ring.length, ix = []; for (let i = 0; i < n; i++) if (arc[i] === a.arc) ix.push(i); if (ix.length < 2) return null
  let f0 = ix[0]; if (ix.length < n && arc[(f0 - 1 + n) % n] === a.arc) { f0 = ix.find(i => arc[(i - 1 + n) % n] !== a.arc) ?? f0 }
  const out = []; for (let k = 0, i = f0; k < n && arc[i] === a.arc; k++, i = (i + 1) % n) out.push(i); return out }
const runStr = (t, si, i) => { const r = t.iaStamp?.[si]?.[i]; const x = r == null ? null : t.runs?.[r]; return x ? `${x.skelId}|${x.side}|${x.segOrd}` : 'none' }
const custom = (t, si, i) => { const r = t.iaStamp?.[si]?.[i]; const x = r == null ? null : t.runs?.[r]; return x ? (bc?.[x.skelId]?.[x.side]?.[x.segOrd] ?? null) : null }
const arcs = (R.cornerArcs || []).filter(a => !a.pad && a.kind !== 'nostreet').map(a => { const ix = ixOf(a); return { ...a, ix, arcPts: ix?.map(i => T[a.tile].iaFull[a.si][i]) } }).filter(a => a.arcPts?.length >= 2)
const fmt = (p) => p.map(([m, t, c]) => `${m}${c ? `(${c})` : ''}@${t.toFixed(2)}`).join(' > ')
let n = 0
for (const a of arcs) {
  const A = a.arcPts, cum = [0]; for (let i = 1; i < A.length; i++) cum.push(cum[i - 1] + Math.hypot(A[i][0] - A[i - 1][0], A[i][1] - A[i - 1][1]))
  const L = cum[cum.length - 1]; if (!(L > 0.2)) continue
  const stationAt = (s) => { let i = 1; while (i < A.length - 1 && cum[i] < s) i++; const tt = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), U = A[i - 1], V = A[i]
    const P = [U[0] + (V[0] - U[0]) * tt, U[1] + (V[1] - U[1]) * tt], d = [V[0] - U[0], V[1] - U[1]], l = Math.hypot(...d) || 1, nn = [-d[1] / l, d[0] / l]
    const inw = what(P[0] + nn[0] * 0.05, P[1] + nn[1] * 0.05) ? nn : [-nn[0], -nn[1]]
    return { P, inw, prof: profile(P, inw) } }
  const t0 = stationAt(0.01).prof, t1 = stationAt(L - 0.01).prof, ord = (p) => p.map(x => x[0]).join('>')
  if (!t0.length || ord(t0) !== ord(t1)) continue
  let why = null
  for (const s of [0.25, 0.5, 0.75]) { const p = stationAt(L * s).prof
    if (ord(p) !== ord(t0)) { why = `order at ${s * 100}%`; break }
    const off = p.findIndex((x, i) => x[1] < Math.min(t0[i][1], t1[i][1]) - TOL || x[1] > Math.max(t0[i][1], t1[i][1]) + TOL)
    if (off >= 0) { why = `${p[off][0]} at ${s * 100}%: ${p[off][1].toFixed(2)} vs tangents ${t0[off][1].toFixed(2)}/${t1[off][1].toFixed(2)}`; break } }
  if (!why) continue
  n++
  const t = T[a.tile], ring = t.iaFull[a.si], N = ring.length, ix = a.ix, before = (ix[0] - 1 + N) % N, after = ix[ix.length - 1]
  const mid = stationAt(L / 2), probe = [mid.P[0] + mid.inw[0] * 0.3, mid.P[1] + mid.inw[1] * 0.3]
  const holders = T.map((tt, k) => (tt.ring && pip(probe[0], probe[1], tt.ring)) ? k : -1).filter(k => k >= 0)
  console.log(`\n✗ ${n}. (${A[0][0].toFixed(1)}, ${A[0][1].toFixed(1)}) ${a.kind}${a.notCorner ? ' (not a corner)' : ''} — ${why}`)
  console.log(`   tile ${a.tile} (rings holding the arc's inward point by geometry: ${holders.join(',') || 'none'}) · ring ${a.si} · arc ${a.arc} · ${ix.length} vertices ${ix[0]}..${ix[ix.length - 1]} · ${L.toFixed(2)} m · iaArcKey ${a.key ?? '—'}`)
  const onArc = [...new Set(ix.map(i => runStr(t, a.si, i)))]
  console.log(`   flank before (edge ${before}): ${runStr(t, a.si, before)} · on the arc: ${onArc.join(', ')} · flank after (edge ${after}): ${runStr(t, a.si, (after + 1) % N)}`)
  const cs = [before, ...ix, (after + 1) % N].map(i => [runStr(t, a.si, i), custom(t, a.si, i)]).filter(([, c]) => c)
  const uniq = new Map(cs.map(([k, c]) => [k, c]))
  console.log(`   blockCustoms on these runs: ${uniq.size ? [...uniq].map(([k, c]) => `${k} ${JSON.stringify(c)}`).join(' · ') : 'none'}`)
  console.log(`   corner entry (cornerCornerRadiusOverrides[${a.key ?? '—'}]): ${a.key && ccro[a.key] != null ? JSON.stringify(ccro[a.key]) : 'none'} · blockLandUse on this tile ring: ${t.ring && blu[blockKeyFromRing(t.ring)] != null ? JSON.stringify(blu[blockKeyFromRing(t.ring)]) : 'none'}`)
  for (const s of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) { const q = stationAt(Math.min(Math.max(L * s, 0.01), L - 0.01))
    console.log(`     ${String(Math.round(s * 100)).padStart(3)}%  (${q.P[0].toFixed(2)}, ${q.P[1].toFixed(2)})  ${fmt(q.prof)}`) }
}
console.log(`\n${scene}: ${n} RED arc(s) traced · painter at ${process.env.PAINTER_REV || 'this worktree'}`)
