// walk-chord.mjs — the walk-why split's "D within the limit — the fixed mesh chords it" stations, measured (Boz,
// 2026-10-18): at each, the variant D's own fall and the drawn fall the gate measured (its --json), both as a share of
// the walk limit, against the girdle's split of that limit (WALK_SHARE for the profile, the rest for the drawing's chord,
// read from the deformer's source); and the drawn fall of the BASE slab at the same three points (the base mesh, as
// baked), so the base's headroom there is seen. Read-only.
//   PIECES=1 node walk-chord.mjs <base walk json> <variant walk json> <dump.json> <variant groundDeformer.mjs> <base slab dir>
import { readFileSync } from 'fs'
import { resolve, join } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const [aF, bF, dumpF, defF, baseDir] = process.argv.slice(2), A = JSON.parse(readFileSync(aF, 'utf8')), B = JSON.parse(readFileSync(bF, 'utf8')), dump = JSON.parse(readFileSync(dumpF, 'utf8'))
const town = 'hipointedemun', T = loadSceneTerrain(town), raw = T.getElevationRaw, E = T.exag, design = readBakeDesign(town, town, 'wc'), walkN = resolveWalkNorm(town, null), lawn = resolveLawnNorm(town, null).slopeMax
const sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM, blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const SHARE = Number(readFileSync(resolve(defF), 'utf8').match(/const WALK_SHARE = ([0-9.]+)/)?.[1]); if (!(SHARE > 0)) throw new Error('walk-chord: WALK_SHARE not found in the deformer')
const LH = lineHeights({ streets: JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, raw, sigma })
const { buildDeformer } = await import(resolve(defF))
const D = buildDeformer({ town, tiles: dump.tiles, ink: dump.ink, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: (id, p) => LH.heightAt(id, p) }, ...(process.env.PIECES ? { pieces: dump.bandPieces } : {}), limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawn, exag: E, blend, sigma } })
const lim = walkN.crossSlopeMax
// the base slab's sidewalk mesh, for its drawn height at a point (barycentric in the containing triangle)
const gj = JSON.parse(readFileSync(join(baseDir, 'ground.json'), 'utf8')), bin = readFileSync(join(baseDir, gj.bin)), g = gj.groups.find(q => q.id === 'sidewalk')
const P = new Float32Array(bin.buffer, bin.byteOffset + g.vertexByteOffset, g.vertexCount * 3), R = new Float32Array(bin.buffer, bin.byteOffset + g.rawByteOffset, g.vertexCount), I = new Uint32Array(bin.buffer, bin.byteOffset + g.indexByteOffset, g.indexCount)
const C = 4, tg = new Map()
for (let t = 0; t < I.length; t += 3) { const xs = [0, 1, 2].map(k => P[I[t + k] * 3]), zs = [0, 1, 2].map(k => P[I[t + k] * 3 + 2])
  for (let x = Math.floor(Math.min(...xs) / C); x <= Math.floor(Math.max(...xs) / C); x++) for (let z = Math.floor(Math.min(...zs) / C); z <= Math.floor(Math.max(...zs) / C); z++) { const k = x * 1e7 + z; (tg.get(k) || tg.set(k, []).get(k)).push(t) } }
const drawn = (x, z) => { for (const t of tg.get(Math.floor(x / C) * 1e7 + Math.floor(z / C)) || []) { const [a, b, c] = [0, 1, 2].map(k => I[t + k])
    const d = (P[b * 3 + 2] - P[c * 3 + 2]) * (P[a * 3] - P[c * 3]) + (P[c * 3] - P[b * 3]) * (P[a * 3 + 2] - P[c * 3 + 2]); if (!d) continue
    const l1 = ((P[b * 3 + 2] - P[c * 3 + 2]) * (x - P[c * 3]) + (P[c * 3] - P[b * 3]) * (z - P[c * 3 + 2])) / d, l2 = ((P[c * 3 + 2] - P[a * 3 + 2]) * (x - P[c * 3]) + (P[a * 3] - P[c * 3]) * (z - P[c * 3 + 2])) / d, l3 = 1 - l1 - l2
    if (l1 >= 0 && l2 >= 0 && l3 >= 0) return l1 * R[a] + l2 * R[b] + l3 * R[c] } return null }
const near = (L, p) => L.some(s => Math.hypot(s.at[0] - p[0], s.at[1] - p[1]) < 0.5)
const fallOf = (h, w0, wm, w1) => Math.max(Math.abs(h[1] - h[0]) / (wm - w0), Math.abs(h[2] - h[1]) / (w1 - wm)) * E
const rows = []
for (const s of B.filter(s => !near(A, s.at))) {
  const pt = (d) => [s.at[0] + s.n[0] * d, s.at[1] + s.n[1] * d], [w0, w1] = s.walk, wm = (w0 + w1) / 2
  const h = [w0, wm, w1].map(d => D.heightAt(...pt(d))); if (h.some(v => v == null)) continue
  const f = fallOf(h, w0, wm, w1); if (f > lim * 1.0001) continue
  const hb = [w0, wm, w1].map(d => drawn(...pt(d)))
  rows.push({ D: f / lim, drawn: s.fall / lim, base: hb.some(v => v == null) ? null : fallOf(hb, w0, wm, w1) / lim }) }
const q = (a, p) => { const s = a.filter(v => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * p)].toFixed(3) : '—' }
const share = (a, pred) => a.filter(pred).length
console.log(`"D within the limit, the mesh chords it": ${rows.length} station(s) · WALK_SHARE ${SHARE} (the profile's share of the limit; the rest is the drawing's)`)
console.log(`  the variant D's fall ÷ limit: p10 ${q(rows.map(r => r.D), .1)} · p50 ${q(rows.map(r => r.D), .5)} · p90 ${q(rows.map(r => r.D), .9)} · over WALK_SHARE ${share(rows, r => r.D > SHARE)} · within it ${share(rows, r => r.D <= SHARE)}`)
console.log(`  the drawn fall (the gate's, variant on the fixed mesh) ÷ limit: p10 ${q(rows.map(r => r.drawn), .1)} · p50 ${q(rows.map(r => r.drawn), .5)} · p90 ${q(rows.map(r => r.drawn), .9)}`)
console.log(`  drawn − D (the chord, ÷ limit): p10 ${q(rows.map(r => r.drawn - r.D), .1)} · p50 ${q(rows.map(r => r.drawn - r.D), .5)} · p90 ${q(rows.map(r => r.drawn - r.D), .9)} · over (1 − WALK_SHARE) ${share(rows, r => r.drawn - r.D > 1 - SHARE)}`)
console.log(`  the BASE slab's drawn fall at the same points ÷ limit: p10 ${q(rows.map(r => r.base), .1)} · p50 ${q(rows.map(r => r.base), .5)} · p90 ${q(rows.map(r => r.base), .9)} · no base triangle ${share(rows, r => r.base == null)} · over the limit ${share(rows, r => r.base != null && r.base > 1.0001)}`)
