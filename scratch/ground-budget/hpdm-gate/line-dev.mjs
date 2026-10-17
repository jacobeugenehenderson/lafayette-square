// line-dev.mjs — HOW FAR THE LINE SITS FROM ITS TERRAIN, and why (Boz, 2026-10-17). At every ② station the deformer uses
// (each ② ring of each tile, every STATION_M = σ/10 between vertices, H linear along ② exactly as the deformer's segments
// carry it — read off the deformer's own records, groundDeformer.why.mjs `_T`): dev = H − terrain at the station, by class
// (the run's street class from ribbons.json `highway` · corner arc · dead-end cap · the highway edge), and the 10 worst runs.
// For a station on a run with a line, dev is split into four terms that sum to it exactly:
//   along ②    H − the run's h projected at the station (② interpolates H between its vertices)
//   sampling   the run's h at the station − lineHeight's own heightAt at the station (run.h is sampled at run.poly)
//   smoothing  lineHeight at the station − the RAW terrain at the chain point it projects to (the window + the diffusion)
//   offset     raw at that chain point − raw at the station (the curb is not the centreline: the cross-street terrain)
// and the smoothing is split again: one graph vs each chain smoothed ALONE (the through-graph coupling), and σ vs σ/2.
// The projection is checked: the station's distance to its chain against the run's median (a jump of > 2 m = a different
// stretch of the chain).
//   node --max-old-space-size=10000 line-dev.mjs --dump=<bands.json> --why=<groundDeformer.why.mjs> [--at='x,z'] [--worst=10]
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const { buildDeformer } = await import(resolve(arg('why')))
const town = 'hipointedemun', dump = JSON.parse(readFileSync(arg('dump'), 'utf8')), tiles = dump.tiles
const design = readBakeDesign(town, town, 'line-dev'), T = loadSceneTerrain(town), raw = T.getElevationRaw
const walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const D = buildDeformer({ town, tiles, bands: dump.bands, stencil: dump.stencil, raw, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma } })
const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets
const byId = new Map(rib.map(s => [s.skelId ?? s.name, s]))
const LH = lineHeights({ streets: rib, raw, sigma }), LH2 = lineHeights({ streets: rib, raw, sigma: sigma / 2 })
const alone = new Map(), LHalone = (id) => { if (!alone.has(id)) { const s = byId.get(id); alone.set(id, s && !s.gradeSeparated ? lineHeights({ streets: [s], raw, sigma }) : null) } return alone.get(id) }
// the run's h projected at p (groundDeformer's hOfRun) · the chain point p projects to (lineHeight's heightAt geometry)
const hOfRun = (run, p) => { let bd = Infinity, out = null
  for (let i = 0; i + 1 < run.poly.length; i++) { const a = run.poly[i], b = run.poly[i + 1]; if (run.h[i] == null || run.h[i + 1] == null) continue
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
    const d = (p[0] - a[0] - u * dx) ** 2 + (p[1] - a[1] - u * dz) ** 2; if (d < bd) { bd = d; out = run.h[i] + u * (run.h[i + 1] - run.h[i]) } }
  return out }
const proj = (P, p) => { let bd = Infinity, q = null, s = 0, sq = 0
  for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
    const x = a[0] + u * dx, z = a[1] + u * dz, d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; q = [x, z]; sq = s + u * Math.sqrt(L2) } s += Math.sqrt(L2) }
  return { q, d: bd, s: sq } }
const STATION_M = sigma / 10, at = arg('at')?.split(',').map(Number)
const cls = new Map(), runs = new Map(), big = []
const add = (c, v) => { (cls.get(c) || cls.set(c, []).get(c)).push(v) }
for (const rec of D._T) for (const R of rec.rings) { const ring = R.ring, n = ring.length, t = tiles[R.t]
  for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.max(1, Math.ceil(L / STATION_M))
    const arc = R.arc[i], st = R.stamp[i], run = st != null ? t.runs[st] : null, cap = t.iaCap?.[R.k]?.[i]
    for (let j = 0; j < k; j++) { const u = j / k, x = p[0] + (q[0] - p[0]) * u, z = p[1] + (q[1] - p[1]) * u, H = R.H[i] + u * (R.H[(i + 1) % n] - R.H[i]), dev = H - raw(x, z)
      let c
      if (arc != null) c = 'corner arc'
      else if (run) c = run.skelId === '__highway__' ? 'highway edge (no line)' : run.noLine ? `no line: ${run.noLine}` : `street: ${byId.get(run.skelId)?.highway ?? '?'}`
      else if (cap != null) c = 'dead-end cap'
      else c = 'no run'
      add(c, dev)
      const rk = arc != null ? `tile ${R.t} arc ${arc}` : run ? `${run.skelId}·${run.side}·${run.segOrd} (tile ${R.t})` : `tile ${R.t} ring ${R.k} v${i}`
      const e = runs.get(rk) || { n: 0, max: 0, at: null, c, sum: 0 }; e.n++; e.sum += Math.abs(dev); if (Math.abs(dev) > Math.abs(e.max)) { e.max = dev; e.at = [x, z] } runs.set(rk, e)
      if (run && Array.isArray(run.h) && !run.noLine && (Math.abs(dev) > 1 || (at && Math.hypot(x - at[0], z - at[1]) < 0.6))) {
        const s = byId.get(run.skelId), hp = hOfRun(run, [x, z]), lh = LH.heightAt(run.skelId, [x, z]), pr = proj(s.points, [x, z]), rq = raw(pr.q[0], pr.q[1])
        const la = LHalone(run.skelId)?.heightAt(run.skelId, [x, z]), l2 = LH2.heightAt(run.skelId, [x, z])
        big.push({ x, z, dev, rk, along: H - hp, sampling: hp - lh, smoothing: lh - rq, offset: rq - raw(x, z), coupling: la == null ? null : lh - la, half: l2 - rq, dq: pr.d, s: pr.s, near: at && Math.hypot(x - at[0], z - at[1]) < 0.6 }) } } } }
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))]
console.log(`${town}: σ ${sigma.toFixed(2)} m · stations every ${STATION_M.toFixed(2)} m along ② · dev = H − terrain at the station (m)`)
const all = [...cls.values()].flat()
for (const [c, v] of [['ALL', all], ...[...cls].sort((a, b) => b[1].length - a[1].length)]) { const a = v.map(Math.abs).sort((x, y) => x - y)
  console.log(`  ${c.padEnd(32)} ${String(v.length).padStart(7)} · |dev| p50 ${q(a, 0.5).toFixed(2)} · p90 ${q(a, 0.9).toFixed(2)} · p99 ${q(a, 0.99).toFixed(2)} · max ${a.at(-1).toFixed(2)} · > 1 m ${a.filter(x => x > 1).length}`) }
console.log(`\nthe ${+(arg('worst') || 10)} worst runs (by max |dev|):`)
for (const [k, e] of [...runs].sort((a, b) => Math.abs(b[1].max) - Math.abs(a[1].max)).slice(0, +(arg('worst') || 10))) console.log(`  ${k} · ${e.c} · max ${e.max.toFixed(2)} at (${e.at.map(v => v.toFixed(1))}) · mean |dev| ${(e.sum / e.n).toFixed(2)} over ${e.n} stations`)
// per run, the median projection distance (a station > 2 m beyond it projected onto another stretch)
const med = new Map(); for (const b of big) (med.get(b.rk) || med.set(b.rk, []).get(b.rk)).push(b.dq)
const dqMed = new Map([...med].map(([k, v]) => [k, v.sort((a, b) => a - b)[v.length >> 1]]))
const lineBig = big.filter(b => !b.near)
console.log(`\nwhat carries |dev| > 1 m, on the ${lineBig.length} station(s) of runs with a line (terms sum to dev exactly):`)
const terms = ['along', 'sampling', 'smoothing', 'offset'], dom = new Map()
for (const b of lineBig) { const t = terms.reduce((m, k) => Math.abs(b[k]) > Math.abs(b[m]) ? k : m, terms[0]); dom.set(t, (dom.get(t) || 0) + 1) }
console.log(`  largest term: ${[...dom].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
for (const k of [...terms, 'coupling', 'half']) { const a = lineBig.map(b => b[k]).filter(v => v != null).map(Math.abs).sort((x, y) => x - y); if (a.length) console.log(`  |${k}| p50 ${q(a, 0.5).toFixed(2)} · p90 ${q(a, 0.9).toFixed(2)} · max ${a.at(-1).toFixed(2)}`) }
const jumps = lineBig.filter(b => b.dq > dqMed.get(b.rk) + 2)
console.log(`  projection: ${jumps.length} of them sit > 2 m farther from their chain than the run's median (another stretch)${jumps.length ? `, e.g. ${jumps.slice(0, 3).map(b => `(${b.x.toFixed(1)}, ${b.z.toFixed(1)}) ${b.rk} d ${b.dq.toFixed(1)} vs median ${dqMed.get(b.rk).toFixed(1)}`).join(' · ')}` : ''}`)
if (at) for (const b of big.filter(b => b.near).slice(0, 4)) console.log(`\nat (${b.x.toFixed(2)}, ${b.z.toFixed(2)}) ${b.rk}: dev ${b.dev.toFixed(2)} = along ② ${b.along.toFixed(2)} + sampling ${b.sampling.toFixed(2)} + smoothing ${b.smoothing.toFixed(2)} + offset ${b.offset.toFixed(2)} · coupling ${b.coupling?.toFixed(2)} · σ/2 smoothing ${b.half.toFixed(2)} · to the chain ${b.dq.toFixed(2)} m at s ${b.s.toFixed(1)}`)
