// closed-loop-fit.mjs — per town, read-only (Boz, 2026-10-18, after HPDM's St. Louis Walk of Fame became a 49.5 m circle):
//   (1) every CLOSED-LOOP street chain in clean/skeleton.json (first point = last): how far its RAW trace (its source ways,
//       joined end to end, from raw/osm.json) departs from the chain's fitted line (its bezier segments, sampled), and the
//       circle test skeleton.js `fitClosedLoopCircle` applies (Kåsa residual/R), computed on the POST-RDP points the code
//       uses (`s.points`, RDP 0.3 — RDP_EPS_LOOP) and on the RAW trace (`s._rawPts`, what open chains are fitted on).
//       The circle branch is re-run by text-extracting skeleton.js's own fitClosedLoopCircle / simplifyRDP, unmodified,
//       with the general-bezier fall-through replaced by a marker, so each loop names the branch it took.
//   (2) source ways tagged area=yes that enter as street chains, by highway class.
// ⚠️ Not reproduced: the junction pins (`junctionKeys`) — they move where the circle's arcs split, not the circle; and
// `CURVE_LOOP_CIRCLE_TOL` is read from skeleton.js.      node scratch/footprint-census/closed-loop-fit.mjs [town …]
import { readFileSync, existsSync, readdirSync } from 'fs'
const src = readFileSync('cartograph/skeleton.js', 'utf8')
const grab = (name) => { const i = src.indexOf(`function ${name}(`); if (i < 0) throw new Error(`skeleton.js has no function ${name}`); let d = 0
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1) } }
const TOL = +src.match(/const CURVE_LOOP_CIRCLE_TOL *= *([0-9.e-]+)/)[1], EPS_LOOP = +src.match(/const RDP_EPS_LOOP *= *([0-9.e-]+)/)[1]
const vKey = (p) => `${p.x},${p.z}`, BEZ = 'GENERAL-BEZIER'
const K = new Function('vKey', 'fitClosedLoopBezier', `const CURVE_LOOP_CIRCLE_TOL = ${TOL}; ${['solve3', 'fitClosedLoopCircle', 'rdpRange', 'simplifyRDP', 'perpDist', 'dist', 'dist2'].map(grab).join('\n')}; return { fitClosedLoopCircle, simplifyRDP, solve3 }`)(vKey, () => BEZ)
const kasa = (ring) => { let Sx = 0, Sz = 0, Sxx = 0, Szz = 0, Sxz = 0, Sxw = 0, Szw = 0, Sw = 0
  for (const p of ring) { const w = p.x * p.x + p.z * p.z; Sx += p.x; Sz += p.z; Sxx += p.x * p.x; Szz += p.z * p.z; Sxz += p.x * p.z; Sxw += p.x * w; Szw += p.z * w; Sw += w }
  const s = K.solve3([[Sxx, Sxz, Sx], [Sxz, Szz, Sz], [Sx, Sz, ring.length]], [-Sxw, -Szw, -Sw]); if (!s) return null
  const cx = -s[0] / 2, cz = -s[1] / 2, R2 = cx * cx + cz * cz - s[2]; if (!(R2 > 1)) return null; const R = Math.sqrt(R2)
  return { R, rr: Math.max(...ring.map(p => Math.abs(Math.hypot(p.x - cx, p.z - cz) - R))) / R } }
const lineOf = (c) => { if (!c.segments?.length) return c.points; const out = [c.points[0]]
  c.segments.forEach((g, i) => { const a = c.points[i], b = c.points[i + 1]; if (g.type !== 'bezier') { out.push(b); return }
    for (let k = 1; k < 40; k++) { const t = k / 40, u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
      out.push({ x: w[0] * a.x + w[1] * g.c1.x + w[2] * g.c2.x + w[3] * b.x, z: w[0] * a.z + w[1] * g.c1.z + w[2] * g.c2.z + w[3] * b.z }) } out.push(b) })
  return out }
const segD = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz) }
const lineD = (p, L) => { let d = Infinity; for (let i = 0; i + 1 < L.length; i++) d = Math.min(d, segD(p, L[i], L[i + 1])); return d }
const same = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-3
// the source ways joined end to end into one ring (null if they do not join)
function ringOf(ways) { if (ways.length === 1) return ways[0].coords.map(c => ({ x: c.x, z: c.z }))
  const left = ways.map(w => w.coords.map(c => ({ x: c.x, z: c.z }))), out = left.shift()
  while (left.length) { const e = out[out.length - 1], i = left.findIndex(c => same(c[0], e) || same(c[c.length - 1], e)); if (i < 0) return null
    const c = left.splice(i, 1)[0]; out.push(...(same(c[0], e) ? c : c.slice().reverse()).slice(1)) }
  return out }

const towns = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync('cartograph/data').filter(t => !t.endsWith('-staging') && existsSync(`cartograph/data/${t}/clean/skeleton.json`) && existsSync(`cartograph/data/${t}/raw/osm.json`))
console.log(`circle test: Kåsa residual/R ≤ CURVE_LOOP_CIRCLE_TOL ${TOL} · loop RDP eps ${EPS_LOOP} m (both read from skeleton.js)`)
for (const town of towns) {
  const S = JSON.parse(readFileSync(`cartograph/data/${town}/clean/skeleton.json`, 'utf8')).streets
  const W = new Map((JSON.parse(readFileSync(`cartograph/data/${town}/raw/osm.json`, 'utf8')).ground?.highway || []).map(f => [f.osmId, f]))
  const loops = S.filter(s => s.points.length >= 4 && same(s.points[0], s.points[s.points.length - 1]))
  const rows = [], unjoined = []
  for (const s of loops) { const ways = (s.sources || []).map(id => W.get(id)).filter(Boolean), raw = ringOf(ways)
    if (!raw || !same(raw[0], raw[raw.length - 1])) { unjoined.push(s.id); continue }
    const post = K.simplifyRDP(raw, EPS_LOOP, null), L = lineOf(s), off = Math.max(...raw.map(p => lineD(p, L)))
    const kp = kasa(post.slice(0, -1)), kr = kasa(raw.slice(0, -1)), fit = K.fitClosedLoopCircle(post, new Set())
    rows.push({ id: s.id, hw: s.highway, area: ways.some(w => w.tags?.area === 'yes'), raw: raw.length, post: post.length, off, kp, kr,
      branch: fit === BEZ ? 'general bezier' : fit ? 'CIRCLE' : 'none (faceted)', curved: !!s.segments?.length }) }
  const circ = rows.filter(r => r.branch === 'CIRCLE'), flip = circ.filter(r => r.kr && r.kr.rr > TOL)
  console.log(`CL ${town}: ${loops.length} closed-loop chain(s) · raw trace not joinable ${unjoined.length}${unjoined.length ? ` (${unjoined.slice(0, 4).join(', ')})` : ''} · branch: circle ${circ.length} · general bezier ${rows.filter(r => r.branch === 'general bezier').length} · none ${rows.filter(r => r.branch.startsWith('none')).length}`)
  console.log(`CL   circle branch whose RAW trace FAILS the circle test (residual/R > ${TOL} off _rawPts): ${flip.length} · raw trace off the fitted line: max ${circ.length ? Math.max(...circ.map(r => r.off)).toFixed(2) : '-'} m, > 1 m on ${circ.filter(r => r.off > 1).length}`)
  for (const r of [...rows].sort((a, b) => b.off - a.off).slice(0, 8)) console.log(`CL     ${r.id} [${r.hw}${r.area ? ', area=yes' : ''}] ${r.branch} · ${r.raw} raw → ${r.post} post-RDP · raw off the fitted line ${r.off.toFixed(2)} m · residual/R post-RDP ${r.kp ? r.kp.rr.toFixed(3) : '-'} · raw ${r.kr ? r.kr.rr.toFixed(3) : '-'} (R ${r.kp ? r.kp.R.toFixed(1) : '-'} m)`)
  // (2)
  const byCls = {}, ex = []; for (const s of S) for (const id of s.sources || []) { const w = W.get(id); if (w?.tags?.area !== 'yes') continue
    byCls[w.tags.highway] = (byCls[w.tags.highway] || 0) + 1; if (ex.length < 5) ex.push(`${s.id} ← way ${id} (${w.tags.name || '(unnamed)'} · ${w.tags.highway})`) }
  console.log(`CL   (2) area=yes source ways in street chains: ${Object.values(byCls).reduce((a, b) => a + b, 0)} · by class: ${Object.entries(byCls).map(([k, v]) => `${k} ${v}`).join(' · ') || '(none)'}${ex.length ? ` · ${ex.join(' · ')}` : ''}`)
}
