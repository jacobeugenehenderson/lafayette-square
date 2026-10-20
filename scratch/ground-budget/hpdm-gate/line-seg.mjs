// line-seg.mjs — the ② segment and run.poly segment under a station: its ring vertices (stamp · arc · H), the run.poly segment
// hOfRun projects the station onto (length, its two h, where its ends project on the chain), and lineHeight along that chain
// between them. Read-only. node --max-old-space-size=8000 line-seg.mjs --dump=… --why=… --at='x,z'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const { buildDeformer } = await import(resolve(arg('why')))
const town = 'hipointedemun', dump = JSON.parse(readFileSync(arg('dump'), 'utf8')), tiles = dump.tiles, [ax, az] = arg('at').split(',').map(Number)
const design = readBakeDesign(town, town, 'line-seg'), T = loadSceneTerrain(town), raw = T.getElevationRaw, walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const D = buildDeformer({ town, tiles, bands: dump.bands, stencil: dump.stencil, raw, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma } })
const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, LH = lineHeights({ streets: rib, raw, sigma })
const byId = new Map(rib.map(s => [s.skelId ?? s.name, s]))
const proj = (P, p) => { let bd = Infinity, sq = 0, s = 0; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0, d = Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dz); if (d < bd) { bd = d; sq = s + u * Math.sqrt(L2) } s += Math.sqrt(L2) } return { d: bd, s: sq } }
let best = null; for (const rec of D._T) for (const R of rec.rings) for (let i = 0; i < R.ring.length; i++) { const p = R.ring[i], q = R.ring[(i + 1) % R.ring.length], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((ax - p[0]) * dx + (az - p[1]) * dz) / L2)) : 0, d = Math.hypot(ax - p[0] - u * dx, az - p[1] - u * dz); if (!best || d < best.d) best = { d, R, i, u } }
const { R, i } = best, n = R.ring.length, t = tiles[R.t], f = (v) => v == null ? '—' : (+v).toFixed(2)
console.log(`② segment tile ${R.t} ring ${R.k} v${i}→v${(i + 1) % n}, ${Math.hypot(R.ring[(i + 1) % n][0] - R.ring[i][0], R.ring[(i + 1) % n][1] - R.ring[i][1]).toFixed(2)} m, the station at u ${best.u.toFixed(3)}`)
for (let j = i - 2; j <= i + 3; j++) { const k = (j + n) % n, p = R.ring[k], st = R.stamp[k], run = st != null ? t.runs[st] : null
  console.log(`  v${k} (${p.map(v => v.toFixed(2))}) stamp ${st ?? '—'}${run ? ` ${run.skelId}·${run.side}·${run.segOrd}` : ''} arc ${R.arc[k] ?? '—'} · H ${f(R.H[k])} · terrain ${f(raw(p[0], p[1]))}${run ? ` · LH at it ${f(LH.heightAt(run.skelId, p))} · chain s ${proj(byId.get(run.skelId).points, p).s.toFixed(1)} d ${proj(byId.get(run.skelId).points, p).d.toFixed(2)}` : ''}`) }
const st = R.stamp[i], run = st != null ? t.runs[st] : null
if (run) { const P = run.poly, ch = byId.get(run.skelId).points; let bj = 0, bd = Infinity
  for (let j = 0; j + 1 < P.length; j++) { const a = P[j], b = P[j + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((ax - a[0]) * dx + (az - a[1]) * dz) / L2)) : 0, d = Math.hypot(ax - a[0] - u * dx, az - a[1] - u * dz); if (d < bd) { bd = d; bj = j } }
  const a = P[bj], b = P[bj + 1], pa = proj(ch, a), pb = proj(ch, b)
  console.log(`run ${st}: ${P.length} poly points · the segment under the station: poly ${bj}→${bj + 1}, ${Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(2)} m, h ${f(run.h[bj])}→${f(run.h[bj + 1])} · its ends project to chain s ${pa.s.toFixed(1)} (d ${pa.d.toFixed(2)}) and ${pb.s.toFixed(1)} (d ${pb.d.toFixed(2)})`)
  console.log(`  run.poly ends: (${P[0].map(v => v.toFixed(1))}) → (${P.at(-1).map(v => v.toFixed(1))}) · the station is ${bd.toFixed(2)} m off that segment · LH at the station ${f(LH.heightAt(run.skelId, [ax, az]))} · terrain ${f(raw(ax, az))}`) }
