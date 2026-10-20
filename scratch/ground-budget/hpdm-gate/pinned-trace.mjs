// pinned-trace.mjs (derived from girdle-split.mjs) — WHY an owner's R is PINNED, at every pinned owner of a surviving seam wall. R is the
// absorption read off ② at the owner's station (absorbAt: the station's A, smoothed along ② and held in its envelope); the
// point's own ray needs |Araw| and its band can take cap. Each pinned owner is classed against the STATION's record
// (st[a]: its own Araw, cap, A):
//   opposite sign       the station's ray needs the other way (up vs down) from the point's
//   held below its own  R < the station's own min(|Araw|, cap): the smoothing or the envelope took it down
//   station cap smaller the station's ray finds less band to take it (a narrower lawn/walk than the point's ray)
//   station need smaller the station's ray reaches a back edge needing less rise than the point's
//   other               none of the above (cause not established)
// Read-only. node --max-old-space-size=8000 pinned-trace.mjs --slab=… --dump=… --why=<copy with u> [--tol=0.01]
// the rest of the original header follows:
// girdle-split.mjs — the OWNER SEAMS left under a deformer (a make-why.mjs probe copy: --why), on the gate slab's FIXED
// mesh, and each surviving seam wall split by its two owners' own profile inputs (the owners with the highest and lowest
// height among its vertices). Per owner: the rise its ray needs to reach the terrain at its band's back edge (Araw), its
// band's capacity there (lawn + walk shares, the town's limits over the band's widths), and what it took (R):
//   PINNED          an owner took less than it needed AND less than its capacity (R held below what the band could take)
//   BEYOND LIMITS   neither is pinned, and the two owners' station heights differ by more than both bands can take together
//                   (|H_A − H_B| > cap_A + cap_B: back-to-back bands on a real slope)
//   within limits   neither is pinned, and the difference is within what both can take (cause not established)
//   on ② / road     an owner reads ② or the road side (no profile)
// Read-only. node --max-old-space-size=8000 girdle-split.mjs --slab=… --dump=… --why=<copy> [--tol=0.01]
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const TOL = +(arg('tol') || 0.01), dir = arg('slab'), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, design = readBakeDesign(town, town, 'girdle-split'), T = loadSceneTerrain(town), raw = T.getElevationRaw, E = T.exag
const walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null), lawn = lawnN.slopeMax
const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, LH = lineHeights({ streets: rib, raw, sigma })
const dump = JSON.parse(readFileSync(arg('dump'), 'utf8')), { buildDeformer } = await import(resolve(arg('why')))
const D = buildDeformer({ town, tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: LH.heightAt }, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: E, blend, sigma } })

const recOf = new Map(); for (const rec of D._T) for (const R of rec.rings) recOf.set(`${R.t}|${R.k}`, R)
const stationAt = (w) => { const R = recOf.get(`${w.t}|${w.k}`); if (!R?.st) return null; const st = R.st, a0 = R.segStart[w.i], a1 = w.i + 1 < R.segStart.length ? R.segStart[w.i + 1] : st.length
  let a = a0, hi = a1 - 1; while (a < hi) { const m = (a + hi + 1) >> 1; if (st[m].u <= w.u) a = m; else hi = m - 1 } return st[a] }
const cnt = new Map(), ex0 = new Map(); let pinnedOwners = 0, seamWalls = 0, pinnedWalls = 0
const capOf = (w) => w.lawnCap * (w.lawnW > 0 ? 1 : 0) + w.walkCap, took = (w) => w.byLawn + w.byWalk
for (const g of gj.groups) { if (g.rawByteOffset == null) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  const h = new Float64Array(g.vertexCount), own = new Array(g.vertexCount), st = new Uint8Array(g.vertexCount), ter = new Float64Array(g.vertexCount)
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2], d = D.heightAt(x, z); ter[v] = raw(x, z)
    if (d == null) { h[v] = ter[v]; st[v] = D.unownedIn(x, z) != null ? 2 : 1 } else { h[v] = d; own[v] = D.ownerAt(x, z) } }
  for (let k = 0; k < I.length; k += 3) { const a = I[k], b = I[k + 1], c = I[k + 2]
    const ex = (Math.max(h[a], h[b], h[c]) - Math.min(h[a], h[b], h[c])) * E - (Math.max(ter[a], ter[b], ter[c]) - Math.min(ter[a], ter[b], ter[c])) * E
    if (!(ex > LATTICE_M)) continue
    const span = Math.max(Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 2] - P[b * 3 + 2]), Math.hypot(P[b * 3] - P[c * 3], P[b * 3 + 2] - P[c * 3 + 2]), Math.hypot(P[c * 3] - P[a * 3], P[c * 3 + 2] - P[a * 3 + 2]))
    if (ex <= lawn * span) continue
    if (st[a] || st[b] || st[c] || (own[a] === own[b] && own[b] === own[c])) continue
    seamWalls++
    const vs = [a, b, c].sort((p, q) => h[p] - h[q]); let anyPinned = false
    for (const v of [vs[0], vs[2]]) { const w = D._why(P[v * 3], P[v * 3 + 2]).why; if (w?.R == null) continue
      if (!(took(w) < Math.min(Math.abs(w.Araw), capOf(w)) - TOL)) continue
      anyPinned = true; pinnedOwners++
      const S = stationAt(w), k2 = !S ? 'no station record' : Math.sign(S.Araw) !== Math.sign(w.Araw) && Math.abs(S.Araw) > TOL ? 'opposite sign (the station needs the other way)'
        : Math.abs(w.R) < Math.min(Math.abs(S.Araw), S.cap) - TOL ? 'held below its own (smoothing / envelope)'
        : S.cap < Math.min(Math.abs(w.Araw), capOf(w)) - TOL ? 'station cap smaller (its ray finds less band)'
        : Math.abs(S.Araw) < Math.min(Math.abs(w.Araw), capOf(w)) - TOL ? 'station need smaller (its ray reaches another back)' : 'other (cause not established)'
      cnt.set(k2, (cnt.get(k2) || 0) + 1); ex0.set(k2, Math.max(ex0.get(k2) || 0, ex)) }
    if (anyPinned) pinnedWalls++ } }
console.log(`${arg('why').split('/').at(-1)}: ${seamWalls} owner-seam wall(s) · ${pinnedWalls} with a pinned owner · ${pinnedOwners} pinned owner(s), by cause:`)
for (const [k, n] of [...cnt].sort((x, y) => y[1] - x[1])) console.log(`    ${String(n).padStart(6)}  ${k} · worst wall ${ex0.get(k).toFixed(2)} m`)
