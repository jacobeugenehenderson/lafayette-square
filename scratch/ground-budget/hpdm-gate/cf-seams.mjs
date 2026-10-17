// cf-seams.mjs — the wall and OWNER-SEAM counts if the deformer's heights came from elsewhere, on the gate slab's FIXED mesh
// (it is not re-refined: a preview by count, nothing built, nothing written). Every vertex of every group with a baked terrain
// part is re-heighted with the variant's D (null → the terrain, as bake-ground draws it); a triangle is a wall by
// claims-the-ground-meets-its-terrain's own test, and is classed as wall-class.mjs classes it: reach edge (a vertex D does not
// reach and no band claims) · unowned · owner seam (owners differ) · one owner. Variants:
//   base  the gate's deformer and tiles (must reproduce the slab: stored aRaw = D, and wall-class's counts)
//   raw   (a) every ② station takes the raw terrain at the station (make-cf.mjs's groundDeformer.cf-raw.mjs)
//   half  (c) the line smoothed at HALF the window: run.h and iaCapH recomputed through lineHeight.mjs as bake-ground does
//   new   --new=<groundDeformer.mjs>: a deformer that asks the line at the point (`line`, lineHeight at σ, passed to every variant)
//   road  --road=<groundDeformer.cf-road.mjs>: new, with the road side reading its owner edge at the point (make-road.mjs)
//   node --max-old-space-size=6000 cf-seams.mjs --slab=… --dump=… --deformer=<groundDeformer.mjs> --raw=<cf-raw copy> [--new=<groundDeformer.mjs>] [--only=base,raw,half,new]
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const dir = arg('slab'), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, design = readBakeDesign(town, town, 'cf-seams'), T = loadSceneTerrain(town), raw = T.getElevationRaw, E = T.exag
const walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null), lawn = lawnN.slopeMax
const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets
const r3 = (v) => Math.round(v * 1000) / 1000
const reline = (tiles, LH) => { let changed = 0
  for (const t of tiles) { for (const run of t.runs || []) { if (!Array.isArray(run.h) || run.skelId === '__water__') continue
      const h = run.poly.map(p => LH.heightAt(run.skelId, p)); if (h.every(v => v != null)) { const n = h.map(r3); n.forEach((v, i) => { if (v !== run.h[i]) changed++ }); run.h = n } }
    if (t.iaCapH) t.iaCapH = t.iaFull.map((ring, ri) => ring.map((p, i) => { const c = t.iaCap?.[ri]?.[i]; if (c == null) return null; const h = LH.heightAt(t.caps[c].skelId, p); return h == null ? null : r3(h) })) }
  return changed }
const only = (arg('only') || 'base,raw,half').split(',')
for (const V of only) {
  const dump = JSON.parse(readFileSync(arg('dump'), 'utf8')), t0 = Date.now()
  let note = ''
  if (V === 'base') note = `run.h re-derived at σ differs from the dump at ${reline(JSON.parse(readFileSync(arg('dump'), 'utf8')).tiles, lineHeights({ streets: rib, raw, sigma }))} point(s) (0 = the dump's lines are lineHeight's)`
  if (V === 'half') note = `σ/2 = ${(sigma / 2).toFixed(2)} m: run.h changed at ${reline(dump.tiles, lineHeights({ streets: rib, raw, sigma: sigma / 2 }))} point(s)`
  const { buildDeformer } = await import(resolve(V === 'raw' ? arg('raw') : V === 'new' ? arg('new') : V === 'road' ? arg('road') : arg('deformer')))
  const LHs = lineHeights({ streets: rib, raw, sigma }), line = { step: LHs.step, heightAt: (id, p) => { if (id === '__water__') throw new Error('cf-seams: a coast run — the high water is not wired here'); return LHs.heightAt(id, p) } }
  const D = buildDeformer({ town, tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw, line, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: E, blend, sigma } })
  const cls = { 'reach edge': 0, unowned: 0, 'owner seam': 0, 'one owner': 0 }, seamBy = new Map(), pairs = new Map(), worstBy = {}; let roadSeams = 0; const reach = new Map(); let walls = 0, worst = 0, mism = 0, over2 = 0
  for (const g of gj.groups) { if (g.rawByteOffset == null) continue; const gid = `${g.kind}:${g.id}`
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), Rw = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
    const h = new Float32Array(g.vertexCount), own = new Array(g.vertexCount), st = new Uint8Array(g.vertexCount), ter = new Float64Array(g.vertexCount)
    for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2], d = D.heightAt(x, z); ter[v] = raw(x, z)
      if (d == null) { h[v] = ter[v]; st[v] = D.unownedIn(x, z) != null ? 2 : 1 } else { h[v] = d; own[v] = D.ownerAt(x, z) }
      if (V === 'base' && Math.abs(h[v] - Rw[v]) > 1e-3) mism++ }
    for (let k = 0; k < I.length; k += 3) { const a = I[k], b = I[k + 1], c = I[k + 2]
      const rise = (Math.max(h[a], h[b], h[c]) - Math.min(h[a], h[b], h[c])) * E, trise = (Math.max(ter[a], ter[b], ter[c]) - Math.min(ter[a], ter[b], ter[c])) * E, ex = rise - trise
      if (!(ex > LATTICE_M)) continue
      const span = Math.max(Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 2] - P[b * 3 + 2]), Math.hypot(P[b * 3] - P[c * 3], P[b * 3 + 2] - P[c * 3 + 2]), Math.hypot(P[c * 3] - P[a * 3], P[c * 3 + 2] - P[a * 3 + 2]))
      if (ex <= lawn * span) continue
      walls++; worst = Math.max(worst, ex); if (ex > 2) over2++
      const c0 = st[a] === 1 || st[b] === 1 || st[c] === 1 ? 'reach edge' : st[a] === 2 || st[b] === 2 || st[c] === 2 ? 'unowned' : (own[a] !== own[b] || own[b] !== own[c]) ? 'owner seam' : 'one owner'
      cls[c0]++; if (!(worstBy[c0]?.ex >= ex)) worstBy[c0] = { ex, g: gid, at: [(P[a * 3] + P[b * 3] + P[c * 3]) / 3, (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3] }
      if (c0 === 'owner seam' && /^mat:(asphalt|stripe|highway)/.test(gid)) roadSeams++
      if (c0 === 'reach edge') { let dm = 0, road = false, out = false
        for (const w of [a, b, c]) { const x = P[w * 3], z = P[w * 3 + 2]; if (st[w] === 1) { const e = D.explain(x, z); if (e.outside) out = true; continue }
          const e = D.explain(x, z); if (e.station && !e.inBlock) road = true; if (e.d > dm) dm = e.d }
        const k = `${road ? 'road side' : 'block side'} · ${out ? 'beside outside every tile' : 'beside beyond reach'} · H carried ${dm < 5 ? '< 5 m' : dm < 15 ? '5–15 m' : dm < 30 ? '15–30 m' : '≥ 30 m'}`
        reach.set(k, (reach.get(k) || 0) + 1) }
      if (c0 === 'owner seam') { seamBy.set(gid, (seamBy.get(gid) || 0) + 1)
        // the pair that meets: arc ↔ run, two runs of one chain or of two, and whether the owners are in different tiles
        const os = [...new Set([own[a], own[b], own[c]])].map(o => o.split('|')), nm = (o) => o[2][0] === 'a' ? 'arc' : dump.tiles[+o[0]]?.runs?.[+o[2].slice(1)]?.skelId ?? '?'
        const names = os.map(nm), k = [...new Set(names.map(x => x === 'arc' ? 'arc' : 'run'))].sort().join('↔')
        const pk = (k === 'run' ? (new Set(names).size > 1 ? 'run↔run, two chains' : 'run↔run, one chain') : k) + (new Set(os.map(o => o[0])).size > 1 ? ' · across tiles' : '') + (names.includes('__highway__') ? ' · a highway edge' : '')
        pairs.set(pk, (pairs.get(pk) || 0) + 1) } } }
  console.log(`${V}: ${walls} wall(s) · worst ${worst.toFixed(2)} m · over 2 m ${over2} · ${Object.entries(cls).map(([k, n]) => `${k} ${n}`).join(' · ')} · seams by group: ${[...seamBy].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(' · ')}${V === 'base' ? ` · stored ≠ D at ${mism} vertex(es)` : ''}${note ? ` · ${note}` : ''} · ${((Date.now() - t0) / 1000).toFixed(0)} s\n      worst by class: ${Object.entries(worstBy).map(([k, w]) => `${k} ${w.ex.toFixed(2)} m ${w.g} at (${w.at.map(v => v.toFixed(1))})`).join(' · ')} · owner seams on the road side (asphalt · stripe · highway) ${roadSeams}\n      reach edge: ${[...reach].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}\n      seams by pair: ${[...pairs].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
}
