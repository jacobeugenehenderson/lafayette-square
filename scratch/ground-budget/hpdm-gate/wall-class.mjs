// wall-class.mjs — EVERY wall triangle (claims-the-ground-meets-its-terrain's own test: excess > LATTICE_M and > the lawn's
// limit × span) classed by how its three vertices got their height (groundDeformer.why.mjs, make-why.mjs, built as bake-ground
// calls it from the same rev's dump):
//   reach edge — a vertex the deformer does not reach (outside every tile / deeper than its reach: the terrain) beside one it does
//   unowned    — a vertex in a ped band no span's band reaches (the gate-only bake drew it at the terrain)
//   owner seam — the vertices are owned by different ② spans (tile|ring|arc-or-run): two heights meet
//   one owner  — one span owns all three; by branch (in band · ease · past the ease · road side), and for the ease the
//                slope the ruled profile hands it: |terrain − hBack| / B against the lawn's limit
// Per class: count, worst, p50, and per group. Also: vertices whose stored aRaw ≠ D (the dump is not the slab's).
//   node --max-old-space-size=10000 wall-class.mjs --slab=<dir> --dump=<bands.json> --why=<groundDeformer.why.mjs> [--groups=a,b]
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const { buildDeformer } = await import(resolve(arg('why')))
const dir = arg('slab'), only = arg('groups')?.split(',')
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, dump = JSON.parse(readFileSync(arg('dump'), 'utf8'))
const design = readBakeDesign(town, town, 'wall-class'), T = loadSceneTerrain(town), E = T.exag
const walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null), lawn = lawnN.slopeMax
const blend = Number.isFinite(design.groundBlendM) && design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const sigma = Number.isFinite(design.groundLineSigmaM) && design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
// `line` for a deformer that asks the line at the point (ignored by one that reads run.h)
const LHs = lineHeights({ streets: JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, raw: T.getElevationRaw, sigma })
const D = buildDeformer({ town, tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw: T.getElevationRaw, line: { step: LHs.step, heightAt: LHs.heightAt },
  limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: E, blend, sigma } })
const cache = new Map(), why = (x, z) => { const k = `${x},${z}`; let r = cache.get(k); if (!r) { r = D._why(x, z); if (r.v == null && !r.why) r.why = { branch: D.explain(x, z).outside ? 'outside every tile' : 'beyond reach' }; cache.set(k, r) } return r }
const cls = new Map(); let mism = 0, n = 0
const add = (c, g, ex) => { let s = cls.get(c); if (!s) cls.set(c, s = { n: 0, ex: [], g: new Map() }); s.n++; s.ex.push(ex); s.g.set(g, (s.g.get(g) || 0) + 1) }
for (const g of gj.groups) { if (g.rawByteOffset == null) continue; const gid = `${g.kind}:${g.id}`; if (only && !only.includes(gid)) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), Rw = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
  for (let k = 0; k < I.length; k += 3) { const v = [I[k], I[k + 1], I[k + 2]]
    const d = v.map(w => Rw[w] * E), tr = v.map(w => T.getElevationRaw(P[w * 3], P[w * 3 + 2]) * E)
    const ex = Math.max(...d) - Math.min(...d) - (Math.max(...tr) - Math.min(...tr)); if (!(ex > LATTICE_M)) continue
    const span = Math.max(...[[0, 1], [1, 2], [2, 0]].map(([a, b]) => Math.hypot(P[v[a] * 3] - P[v[b] * 3], P[v[a] * 3 + 2] - P[v[b] * 3 + 2])))
    if (ex <= lawn * span) continue
    n++
    const W = v.map(w => why(P[w * 3], P[w * 3 + 2]))
    v.forEach((w, j) => { if (W[j].v != null && Math.abs(W[j].v - Rw[w]) > 1e-3) mism++ })
    const br = W.map(r => r.why.branch)
    let c
    if (br.some(b => b === 'outside every tile' || b === 'beyond reach')) c = `reach edge (${[...new Set(br.filter(b => b === 'outside every tile' || b === 'beyond reach'))].join('+')}) beside ${[...new Set(br.filter(b => b !== 'outside every tile' && b !== 'beyond reach'))].join('+') || '—'}`
    else if (W.some(r => r.unowned != null)) c = 'unowned beside owned'
    else if (new Set(W.map(r => r.owner)).size > 1) { const H = W.map(r => r.why.H), dH = Math.max(...H) - Math.min(...H)
      const own = [...new Set(W.map(r => r.owner))].map(o => o.split('|')), tl = new Set(own.map(o => o[0])).size > 1 ? ' · across tiles' : ''
      const nm = (o) => { if (o[2][0] === 'a') return 'arc'; const run = dump.tiles[+o[0]]?.runs?.[+o[2].slice(1)]; return run ? run.skelId : '?' }
      const names = own.map(nm), kinds = [...new Set(names.map(x => x === 'arc' ? 'arc' : 'run'))].sort().join('↔')
      const pair = kinds === 'run' ? (new Set(names).size > 1 ? 'run↔run, two chains' : 'run↔run, one chain') : kinds === 'arc↔run' ? 'arc↔run' : 'arc↔arc'
      if (arg('pairs')) c = `owner seam · ${pair}${tl} · station H differ ${dH > 1 ? '> 1 m' : dH > 0.1 ? '0.1–1 m' : '< 0.1 m'}`
      else c = `owner seam · ${[...new Set(br)].sort().join('+')} · station H differ ${dH > 1 ? '> 1 m' : dH > 0.1 ? '0.1–1 m' : '< 0.1 m'}` }
    else { const b = [...new Set(br)].sort().join('+')
      if (br.includes('ease')) { const e = W.find(r => r.why.branch === 'ease').why, sl = Math.abs(T.getElevationRaw(P[v[0] * 3], P[v[0] * 3 + 2]) - e.hBack) / e.blend
        c = `one owner · ${b} · ease slope ${sl > lawn ? '> the lawn limit' : '≤ the lawn limit'}` }
      else c = `one owner · ${b}` }
    add(c, gid, ex) } }
console.log(`${town}: ${n} wall triangle(s) · stored ≠ D at ${mism} vertex(es) · lawn ≤ ${lawn.toFixed(4)} · B ${blend.toFixed(2)} m`)
for (const [c, s] of [...cls].sort((a, b) => b[1].n - a[1].n)) { s.ex.sort((a, b) => a - b)
  console.log(`  ${String(s.n).padStart(6)}  ${c} · worst ${s.ex.at(-1).toFixed(2)} m · p50 ${s.ex[s.ex.length >> 1].toFixed(2)} · ${[...s.g].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g, k]) => `${g} ${k}`).join(' · ')}`) }
