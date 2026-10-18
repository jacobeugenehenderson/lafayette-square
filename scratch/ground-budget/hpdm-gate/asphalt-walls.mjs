// asphalt-walls.mjs — read-only: the road groups' wall triangles (the wall test on the stored terrain part), by 200 m cell, and
// by the ① owner the deformer names at the centroid (its class: a street, grade-separated, highway, the ink).
//   node asphalt-walls.mjs <slab dir> <dump.json> <groundDeformer.mjs>
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveLawnNorm, resolveWalkNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
const [dir, dumpF, defF] = process.argv.slice(2), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, T = loadSceneTerrain(town), raw = T.getElevationRaw, E = T.exag, lawn = resolveLawnNorm(town, null).slopeMax, design = readBakeDesign(town, town, 'aw')
const sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM, blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const LH = lineHeights({ streets: JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, raw, sigma })
const dump = JSON.parse(readFileSync(dumpF, 'utf8')), { buildDeformer } = await import(resolve(defF))
const D = buildDeformer({ town, tiles: dump.tiles, ink: dump.ink, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: (id, p) => LH.heightAt(id, p) },
  limits: { walkMax: resolveWalkNorm(town, null).crossSlopeMax ?? 0, lawnMax: lawn, exag: E, blend, sigma } })
const bridges = new Set(); for (const t of dump.tiles) for (const o of t.ringOwner || []) if (o?.gradeSeparated) bridges.add(o.skelId)
const SITES = [], cells = new Map(), cls = new Map(); let n = 0
for (const g of gj.groups) { if (g.rawByteOffset == null || !/^(asphalt|highway|stripe)$/.test(g.id)) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
  for (let k = 0; k < I.length; k += 3) { const v = [I[k], I[k + 1], I[k + 2]], h = v.map(w => R[w]), t = v.map(w => raw(P[w * 3], P[w * 3 + 2]))
    const ex = (Math.max(...h) - Math.min(...h)) * E - (Math.max(...t) - Math.min(...t)) * E; if (!(ex > LATTICE_M)) continue
    const xs = v.map(w => P[w * 3]), zs = v.map(w => P[w * 3 + 2]), span = Math.max(Math.hypot(xs[0] - xs[1], zs[0] - zs[1]), Math.hypot(xs[1] - xs[2], zs[1] - zs[2]), Math.hypot(xs[2] - xs[0], zs[2] - zs[0]))
    if (ex <= lawn * span) continue
    n++; const cx = (xs[0] + xs[1] + xs[2]) / 3, cz = (zs[0] + zs[1] + zs[2]) / 3, ck = `${Math.floor(cx / 200) * 200},${Math.floor(cz / 200) * 200}`
    cells.set(ck, (cells.get(ck) || 0) + 1)
    const o = D.ownerAt(cx, cz) || 'none', id = o.split('|').pop(), kc = o.startsWith('ink') ? 'ink' : o === 'none' ? 'none' : !o.startsWith('①') ? 'ped owner (② side)' : id === '__highway__' ? '① highway' : bridges.has(id) ? '① grade-separated' : id === '__rim__' ? '① rim' : '① street'
    if (kc === '① street') { const e = D.explain(cx, cz); SITES.push({ cx, cz, id, ex, span, L: LH.heightAt(id, [cx, cz]), H2: e.H, d2: e.d, st: e.station, ter: raw(cx, cz), D: D.heightAt(cx, cz) }) }
    cls.set(kc, (cls.get(kc) || 0) + 1) } }
console.log(`road-group walls ${n} · by ① owner class: ${[...cls].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`by 200 m cell (top 10): ${[...cells].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `(${k}) ${v}`).join(' · ')}`)
SITES.sort((a, b) => b.ex - a.ex)
const g = SITES.map(r => Math.abs(r.H2 - r.L) / Math.max(r.d2, 0.01)).sort((a, b) => a - b), q = (f) => g[Math.floor(f * (g.length - 1))]?.toFixed(3)
console.log(`street sites (first 400): |H② − L| / d② p10 ${q(0.1)} · p50 ${q(0.5)} · p90 ${q(0.9)} · |H② − L| p50 ${(SITES.map(r => Math.abs(r.H2 - r.L)).sort((a, b) => a - b)[200] ?? 0).toFixed(2)} m`)
for (const r of SITES.filter((_, i) => i % 50 === 0).slice(0, 8)) console.log(`  (${r.cx.toFixed(1)}, ${r.cz.toFixed(1)}) ${r.id} · excess ${r.ex.toFixed(3)} over ${r.span.toFixed(2)} m · L ${r.L?.toFixed(2)} · H② ${r.H2?.toFixed(2)} at ${r.d2?.toFixed(2)} m (${r.st?.map(v => v.toFixed(1)).join(', ')}) · terrain ${r.ter.toFixed(2)} · D ${r.D?.toFixed(2)}`)

// the ② edge nearest each street site: whose is it? (the tile whose ① ring holds the point → its iaFull edge → iaStamp/iaArc/iaCap)
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const segD = (p, q, x, z) => { const dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / L2)) : 0; return Math.hypot(x - p[0] - u * dx, z - p[1] - u * dz) }
const M = new Map(), MW = new Map(), EX = new Map()
for (const r of SITES) { const t = dump.tiles.find(t => t.ring && pip(r.cx, r.cz, t.ring)); if (!t) continue
  let best = null, bd = Infinity
  t.iaFull.forEach((ring, ri) => ring.forEach((p, i) => { const d = segD(p, ring[(i + 1) % ring.length], r.cx, r.cz); if (d < bd) { bd = d; best = { ri, i } } }))
  const a = t.iaArc?.[best.ri]?.[best.i], st = t.iaStamp?.[best.ri]?.[best.i], cp = t.iaCap?.[best.ri]?.[best.i]
  const o2 = a != null && t.iaArc[best.ri][(best.i + 1) % t.iaFull[best.ri].length] === a ? 'arc' : st != null ? t.runs[st]?.skelId : cp != null ? 'cap:' + t.caps[cp]?.skelId : '?'
  const k = o2 === 'arc' ? '② a corner arc' : o2 === r.id ? '② the same chain' : o2 === '__highway__' ? '② a highway edge' : bridges.has(o2) ? '② a grade-separated chain' : o2.startsWith?.('cap:') ? '② a cap' : '② another street'
  M.set(k, (M.get(k) || 0) + 1); if (!(MW.get(k) >= r.ex)) MW.set(k, r.ex); if (!EX.has(k)) EX.set(k, `(${r.cx.toFixed(1)}, ${r.cz.toFixed(1)}) ① ${r.id} ② ${o2}`) }
console.log(`street-① road walls by their nearest ② edge: ${[...M].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (worst ${MW.get(k).toFixed(2)} m)`).join(' · ')}`)
for (const [k, v] of EX) console.log(`  ${k}: ${v}`)
