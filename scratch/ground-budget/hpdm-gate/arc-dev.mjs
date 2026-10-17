// arc-dev.mjs — the corner arcs' H against the line, and what the blend's arclength includes. Per arc: its own length (its
// vertices only), the approach edges the blend also counts (before→first and last→after, groundDeformer's `pts`), the two
// end heights, and the worst |H − line h at the vertex| (line h = lineHeight at the arc vertex on the run of the end that
// is nearer). The share of arcs whose approach edges outweigh the arc. And, for the line runs, the ② segment length under
// each station with |dev| > 1 m against all stations. Read-only.
//   node --max-old-space-size=10000 arc-dev.mjs --dump=… --why=…
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const { buildDeformer } = await import(resolve(arg('why')))
const town = 'hipointedemun', dump = JSON.parse(readFileSync(arg('dump'), 'utf8')), tiles = dump.tiles
const design = readBakeDesign(town, town, 'arc-dev'), T = loadSceneTerrain(town), raw = T.getElevationRaw, walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const D = buildDeformer({ town, tiles, bands: dump.bands, stencil: dump.stencil, raw, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma } })
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const arcs = [], segAll = [], segBig = []
for (const rec of D._T) for (const R of rec.rings) { const ring = R.ring, n = ring.length, arc = R.arc
  for (let i = 0; i < n; i++) { const L = dist(ring[i], ring[(i + 1) % n])
    if (arc[i] == null && R.stamp[i] != null) { const k = Math.max(1, Math.ceil(L / (sigma / 10)))
      for (let j = 0; j < k; j++) { const u = j / k, x = ring[i][0] + (ring[(i + 1) % n][0] - ring[i][0]) * u, z = ring[i][1] + (ring[(i + 1) % n][1] - ring[i][1]) * u, dev = R.H[i] + u * (R.H[(i + 1) % n] - R.H[i]) - raw(x, z)
        segAll.push(L); if (Math.abs(dev) > 1) segBig.push(L) } }
    if (arc[i] == null || arc[(i + n - 1) % n] === arc[i]) continue
    let j = i; const span = []; while (arc[j % n] === arc[i] && span.length < n) { span.push(j % n); j++ }
    const before = arc[(i + n - 1) % n] == null ? (i + n - 1) % n : span[0], after = arc[j % n] == null ? j % n : span.at(-1)
    let own = 0; for (let k = 1; k < span.length; k++) own += dist(ring[span[k - 1]], ring[span[k]])
    const appr = (before !== span[0] ? dist(ring[before], ring[span[0]]) : 0) + (after !== span.at(-1) ? dist(ring[span.at(-1)], ring[after]) : 0)
    let worst = 0; for (const v of span) { const dv = R.H[v] - raw(ring[v][0], ring[v][1]); if (Math.abs(dv) > Math.abs(worst)) worst = dv }
    arcs.push({ t: R.t, id: arc[i], own, appr, dh: Math.abs(R.H[after] - R.H[before]), worst, nV: span.length, at: ring[span[0]] }) } }
const big = arcs.filter(a => Math.abs(a.worst) > 1)
console.log(`${arcs.length} corner arcs · own length p50 ${q(arcs.map(a => a.own).sort((x, y) => x - y), 0.5).toFixed(1)} m · p90 ${q(arcs.map(a => a.own).sort((x, y) => x - y), 0.9).toFixed(1)} · max ${Math.max(...arcs.map(a => a.own)).toFixed(1)}`)
console.log(`  approach edges the blend also counts: p50 ${q(arcs.map(a => a.appr).sort((x, y) => x - y), 0.5).toFixed(1)} m · p90 ${q(arcs.map(a => a.appr).sort((x, y) => x - y), 0.9).toFixed(1)} · max ${Math.max(...arcs.map(a => a.appr)).toFixed(1)} · arcs where they exceed the arc itself: ${arcs.filter(a => a.appr > a.own).length}`)
console.log(`  arcs with a vertex > 1 m off its terrain: ${big.length} · of those, approach > the arc: ${big.filter(a => a.appr > a.own).length} · the ends' h differ > 1 m: ${big.filter(a => a.dh > 1).length} · own length > 50 m: ${big.filter(a => a.own > 50).length}`)
for (const a of big.sort((x, y) => Math.abs(y.worst) - Math.abs(x.worst)).slice(0, 8)) console.log(`    tile ${a.t} arc ${a.id} at (${a.at.map(v => v.toFixed(1))}): worst ${a.worst.toFixed(2)} · own ${a.own.toFixed(1)} m over ${a.nV} v · approach ${a.appr.toFixed(1)} m · ends differ ${a.dh.toFixed(2)} m`)
segAll.sort((x, y) => x - y); segBig.sort((x, y) => x - y)
console.log(`line-run stations: the ② segment under them, all p50 ${q(segAll, 0.5).toFixed(1)} m · p90 ${q(segAll, 0.9).toFixed(1)} · under |dev| > 1 m p50 ${q(segBig, 0.5).toFixed(1)} · p90 ${q(segBig, 0.9).toFixed(1)} (${segBig.length} stations) · segments > 20 m carry ${(segBig.filter(L => L > 20).length / segBig.length * 100).toFixed(0)}% of the > 1 m stations and ${(segAll.filter(L => L > 20).length / segAll.length * 100).toFixed(0)}% of all`)
