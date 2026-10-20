// new-dev.mjs — the ASKED-AT-THE-POINT deformer (groundDeformer.why-new.mjs, make-why-new.mjs), at every ② station
// (σ/10 along every edge, `R.Hat`): |H − terrain| by class as line-dev.mjs prints it, and the JUMPS the per-edge read makes
// at a ② vertex (edge i−1 at its end against edge i at its start), by size and by whether the owner changes there. Read-only.
//   node --max-old-space-size=8000 new-dev.mjs --dump=… --why=… [--show=8]
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const { buildDeformer } = await import(resolve(arg('why')))
const town = 'hipointedemun', dump = JSON.parse(readFileSync(arg('dump'), 'utf8')), tiles = dump.tiles
const design = readBakeDesign(town, town, 'new-dev'), T = loadSceneTerrain(town), raw = T.getElevationRaw, walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, LH = lineHeights({ streets: rib, raw, sigma })
const D = buildDeformer({ town, tiles, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: LH.heightAt }, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma } })
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))], devs = [], jumps = []
const lab = (R, i) => R.arc[i] != null && R.arc[(i + 1) % R.ring.length] === R.arc[i] ? `arc ${R.arc[i]}` : R.stamp[i] != null ? `run ${R.stamp[i]}` : 'cap/none'
for (const rec of D._T) for (const R of rec.rings) { const n = R.ring.length
  for (let i = 0; i < n; i++) { const p = R.ring[i], qq = R.ring[(i + 1) % n], L = Math.hypot(qq[0] - p[0], qq[1] - p[1]), k = Math.max(1, Math.ceil(L / (sigma / 10)))
    for (let j = 0; j < k; j++) { const u = j / k; devs.push(Math.abs(R.Hat(i, u) - raw(p[0] + (qq[0] - p[0]) * u, p[1] + (qq[1] - p[1]) * u))) }
    const a = R.Hat((i + n - 1) % n, 1), b = R.Hat(i, 0), d = Math.abs(a - b)
    if (d > 0.01) { const ra = tiles[R.t].runs?.[R.stamp[(i + n - 1) % n]], rb = tiles[R.t].runs?.[R.stamp[i]]
      jumps.push({ d, at: p, t: R.t, from: lab(R, (i + n - 1) % n), to: lab(R, i), same: lab(R, (i + n - 1) % n) === lab(R, i), a: ra ? ra.skelId : '—', b: rb ? rb.skelId : '—' }) } } }
devs.sort((x, y) => x - y)
console.log(`asked at the point: ${devs.length} ② stations · |H − terrain| p50 ${q(devs, 0.5).toFixed(2)} · p90 ${q(devs, 0.9).toFixed(2)} · p99 ${q(devs, 0.99).toFixed(2)} · max ${devs.at(-1).toFixed(2)} · > 1 m ${devs.filter(d => d > 1).length}`)
const J = jumps.map(j => j.d).sort((x, y) => x - y)
console.log(`jumps at a ② vertex (> 1 cm): ${jumps.length} · p50 ${q(J, 0.5)?.toFixed(2)} · p90 ${q(J, 0.9)?.toFixed(2)} · max ${J.at(-1)?.toFixed(2)} · > 1 m ${J.filter(d => d > 1).length} · the owner changes there at ${jumps.filter(j => !j.same).length}`)
const byKind = new Map(); for (const j of jumps) { const k = `${j.from.split(' ')[0]} → ${j.to.split(' ')[0]}${j.from.startsWith('run') && j.to.startsWith('run') ? (j.a === j.b ? ' (one chain)' : ' (two chains)') : ''}`; const e = byKind.get(k) || { n: 0, big: 0 }; e.n++; if (j.d > 1) e.big++; byKind.set(k, e) }
console.log(`  by kind: ${[...byKind].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => `${k} ${e.n} (> 1 m ${e.big})`).join(' · ')}`)
for (const j of jumps.sort((x, y) => y.d - x.d).slice(0, +(arg('show') || 8))) console.log(`    ${j.d.toFixed(2)} m at (${j.at.map(v => v.toFixed(1))}) tile ${j.t}: ${j.from} (${j.a}) → ${j.to} (${j.b})`)
