// claims-the-road-meets-itself-across-its-centreline.mjs — DOES THE DRAWN ROAD MEET ITSELF WHERE ITS TWO HALVES READ
// DIFFERENT OWNERS?
//
// ⭐ THE INVARIANT (BRIEF-the-ground-knows-its-height §5, the road side): the carriageway's terrain part is ONE surface. Each
// half takes its height from the owner edge of its own tile's ② (groundDeformer.mjs: the nearest ② span, read at the
// point), and the two halves meet on ①, the road's own ink, which IS the centreline (a tile's ring, `shape.json`
// tile.ring). Where the two owners' heights disagree there, the drawn road steps or creases along the centreline.
// ⭐ READ, NOT SEARCHED: the centreline is each tile's own ① ring, and each half's owner is the ② edge of the tile that holds
//   the point (by its ① ring, never by tile index), its label read off `iaStamp` → `runs[]` / `iaArc` / `iaCap`. No chain is
//   looked up by proximity.
// ⭐ THE DRAWN ROAD is the slab's own mesh: the road groups (`mat:asphalt`, `mat:highway`, `mat:stripe` — the carriageway's
//   partition groups) interpolated at the point. Only the TERRAIN part is compared (`aRaw × E`, E the town's exaggeration
//   ceiling): the groups' own y is their stacking slot (renderOrder × GROUND_Y_EPS) and differs on purpose.
// ⭐ EACH STEP IS NAMED by what its triangles reach: a vertex in the ① INK (the 2ε between two tiles' rings, held by no tile,
//   so the deformer draws the terrain there) — or two halves inside their tiles whose owners disagree.
// ⭐ THE GATE (C0): across the centreline, ±δ (δ = 10 × LATTICE_M, src/lib/lattice.js, read) — the drawn step may exceed
//   the terrain's own change across 2δ by at most LATTICE_M. More is a STEP. The CREASE (the change in cross-slope, from
//   δ to δ + one terrain grid step on each side) is measured and printed: no norm bounds a road's crease, so it is reported,
//   never gated.
// ⛔ A slab with no baked terrain part, or no shape.json, cannot be judged: it fails, said so.
//
//   node checks/claims-the-road-meets-itself-across-its-centreline.mjs [--town=a,b] [--dir=<slab dir>] [--show=n] [--selftest]
// Read-only. Exits 1 on any step, or on a slab that cannot be judged.
// --selftest: lifts the road's terrain part on ONE side of one judged centreline sample by (2 × LATTICE_M + the terrain's
// change) in memory: the check must then report a step it did not report before.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../cartograph/terrainLoad.js'
import { LATTICE_M } from '../src/lib/lattice.js'

const ROOT = new URL('../public/baked/', import.meta.url).pathname
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SHOW = +(arg('show') || 8)
const SELFTEST = process.argv.includes('--selftest')
const dirs = arg('dir') ? [arg('dir')] : (arg('town')?.split(',') || readdirSync(ROOT).filter(t => existsSync(join(ROOT, t, 'ground.json')))).map(t => arg('dir') ? t : join(ROOT, t))
const ROAD = /^mat:(asphalt|highway|stripe)$/
const DELTA = 10 * LATTICE_M, STEP_ALONG = 0.5   // metres between samples along ①

const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }

function judge(dir, mutate = false) {
  if (!existsSync(join(dir, 'shape.json'))) return { town: dir, refused: 'no shape.json beside the slab — the centreline (①) and the owners (②) cannot be read' }
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), town = gj.look
  if (!town) return { town: dir, refused: 'the slab names no town (`look`)' }
  const gb = readFileSync(join(dir, gj.bin || 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
  const road = gj.groups.filter(g => ROAD.test(`${g.kind}:${g.id}`))
  if (!road.length) return { town, refused: 'no road group (mat:asphalt · mat:highway · mat:stripe)' }
  if (road.some(g => g.rawByteOffset == null)) return { town, refused: 'a road group carries no baked terrain part (aRaw): the 5 m texture path — re-bake the ground' }
  const T = loadSceneTerrain(town), E = T.exag, stepM = T.stepM
  if (!(E > 0)) return { town, refused: 'the town names no exaggeration' }
  // the road's triangles, gridded: point → its terrain part, drawn (aRaw × E)
  const CELL = 2, grid = new Map(), tris = []
  for (const g of road) { const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
    for (let k = 0; k < I.length; k += 3) { const v = [I[k], I[k + 1], I[k + 2]], xs = v.map(w => P[w * 3]), zs = v.map(w => P[w * 3 + 2])
      const t = { xs, zs, r: v.map(w => R[w]), g: g.id, ink: null }, id = tris.push(t) - 1
      for (let x = Math.floor(Math.min(...xs) / CELL); x <= Math.floor(Math.max(...xs) / CELL); x++) for (let z = Math.floor(Math.min(...zs) / CELL); z <= Math.floor(Math.max(...zs) / CELL); z++) { const key = x * 1000003 + z; (grid.get(key) || grid.set(key, []).get(key)).push(id) } } }
  let lastTri = null
  const drawn = (x, z) => { for (const id of grid.get(Math.floor(x / CELL) * 1000003 + Math.floor(z / CELL)) || []) { const t = tris[id], [x0, x1, x2] = t.xs, [z0, z1, z2] = t.zs
      const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2); if (d === 0) continue
      const a = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, b = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d, c = 1 - a - b
      if (a >= -1e-9 && b >= -1e-9 && c >= -1e-9) { lastTri = t; return (a * t.r[0] + b * t.r[1] + c * t.r[2]) * E } }
    return null }
  const tiles = JSON.parse(readFileSync(join(dir, 'shape.json'), 'utf8')).tiles || []
  const bb = tiles.map(t => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of t.ring || []) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) } return [a, b, c, d] })
  const tileOf = (x, z) => tiles.findIndex((t, i) => t.ring?.length >= 3 && x >= bb[i][0] && x <= bb[i][2] && z >= bb[i][1] && z <= bb[i][3] && pip(x, z, t.ring))
  // the owner of the nearest ② edge of tile ti at (x, z): `skelId` of its run · 'arc' · 'cap:<skelId>' · null
  const ownerAt = (ti, x, z) => { const t = tiles[ti]; let best = Infinity, out = null
    ;(t.iaFull || []).forEach((ring, ri) => { const n = ring.length; for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz
      const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / L2)) : 0, d = Math.hypot(x - p[0] - u * dx, z - p[1] - u * dz)
      if (d < best) { best = d; const arc = t.iaArc?.[ri], st = t.iaStamp?.[ri]?.[i], cap = t.iaCap?.[ri]?.[i]
        out = arc?.[i] != null && arc[(i + 1) % n] === arc[i] ? { kind: 'arc', id: `t${ti}a${arc[i]}` } : st != null ? { kind: 'run', id: t.runs?.[st]?.skelId ?? '?' } : cap != null ? { kind: 'cap', id: t.caps?.[cap]?.skelId ?? '?' } : null } } })
    return out }
  // ⭐ WHICH: a triangle with a vertex in the ① INK (the 2ε between two tiles' rings, held by no tile: the deformer draws the
  // terrain there) carries the terrain onto the centreline; else the two halves' owners disagree
  const inkOf = (t) => t.ink ??= t.xs.some((x, k) => tileOf(x, t.zs[k]) < 0)
  const seen = new Set(), steps = [], creases = []
  let n = 0, mutated = null
  for (const [ti, t] of tiles.entries()) { const r = t.ring; if (!(r?.length >= 3)) continue
    for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (!(L > 0)) continue
      const nx = -(q[1] - p[1]) / L, nz = (q[0] - p[0]) / L, m = Math.max(1, Math.round(L / STEP_ALONG))
      for (let j = 0; j < m; j++) { const u = (j + 0.5) / m, x = p[0] + (q[0] - p[0]) * u, z = p[1] + (q[1] - p[1]) * u
        const key = `${Math.round(x / 0.25)},${Math.round(z / 0.25)}`; if (seen.has(key)) continue; seen.add(key)
        const A = [x + nx * DELTA, z + nz * DELTA], B = [x - nx * DELTA, z - nz * DELTA]
        let hA = drawn(...A); const triA = lastTri; let hB = drawn(...B); const triB = lastTri; if (hA == null || hB == null) continue   // not carriageway on both sides here
        const tA = tileOf(...A), tB = tileOf(...B); if (tA < 0 || tB < 0 || tA === tB) continue   // ① here is not a seam between two tiles
        n++
        const tstep = Math.abs(T.getElevationRaw(...A) - T.getElevationRaw(...B)) * E
        // the mutation: one road half lifted at the first sample past the 100th that is NOT already a step
        if (mutate && !mutated && n > 100 && Math.abs(hA - hB) - tstep <= LATTICE_M) { hA += Math.sign(hA - hB || 1) * (2 * LATTICE_M + tstep); mutated = `(${x.toFixed(1)}, ${z.toFixed(1)})` }
        const ex = Math.abs(hA - hB) - tstep
        const oA = ownerAt(tA, ...A), oB = ownerAt(tB, ...B)
        const pair = !oA || !oB ? 'an unowned half' : oA.kind === 'run' && oB.kind === 'run' ? (oA.id === oB.id ? 'run↔run, one chain' : 'run↔run, two chains') : [oA.kind, oB.kind].sort().join('↔')
        const hw = [oA?.id, oB?.id].includes('__highway__') ? ' · a highway edge' : ''
        if (ex > LATTICE_M) steps.push({ ex, at: [x, z], pair: pair + hw, a: oA?.id, b: oB?.id, ink: inkOf(triA) || inkOf(triB), groups: [triA.g, triB.g].sort().join('↔') })
        // the crease: the cross-slope on each side, from δ to δ + one terrain grid step
        const A2 = [x + nx * (DELTA + stepM), z + nz * (DELTA + stepM)], B2 = [x - nx * (DELTA + stepM), z - nz * (DELTA + stepM)], hA2 = drawn(...A2), hB2 = drawn(...B2)
        if (hA2 != null && hB2 != null) { const sA = (hA2 - hA) / stepM, sB = (hB - hB2) / stepM; creases.push({ deg: Math.abs(Math.atan(sA) - Math.atan(sB)) * 180 / Math.PI, pair: pair + hw }) } } } }
  steps.sort((a, b) => b.ex - a.ex)
  return { town, E, n, steps, creases, mutated }
}

const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))]
const say = (r) => {
  if (r.refused) { console.log(`  ⛔   ${r.town}: cannot be judged — ${r.refused}`); return 1 }
  const by = (L) => { const m = new Map(); for (const s of L) m.set(s.pair, (m.get(s.pair) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') }
  const cd = r.creases.map(c => c.deg).sort((a, b) => a - b)
  const head = `${r.town}: ${r.n} centreline sample(s) where two tiles' road halves meet (every ${STEP_ALONG} m along ①, ±${(DELTA * 1000).toFixed(0)} mm) · exag ${r.E}`
  const crease = cd.length ? `crease (no norm, not gated): p50 ${q(cd, 0.5).toFixed(2)}° · p90 ${q(cd, 0.9).toFixed(2)}° · p99 ${q(cd, 0.99).toFixed(2)}° · max ${cd.at(-1).toFixed(2)}° · > 3° ${cd.filter(d => d > 3).length} (${by(r.creases.filter(c => c.deg > 3))})` : 'crease: no sample'
  if (!r.steps.length) { console.log(`  ✓   ${head} · no step\n        ${crease}`); return 0 }
  const ink = r.steps.filter(s => s.ink), own = r.steps.filter(s => !s.ink)
  console.log(`  ⛔   ${head}\n        ${r.steps.length} STEP(S) beyond the terrain's own change + LATTICE_M, worst ${r.steps[0].ex.toFixed(3)} m · by owner pair: ${by(r.steps)}`)
  console.log(`        on a triangle reaching into the ① ink (held by no tile — the terrain drawn on the centreline): ${ink.length}${ink.length ? `, worst ${Math.max(...ink.map(s => s.ex)).toFixed(3)} m` : ''} · both halves inside tiles (their owners disagree): ${own.length}${own.length ? `, worst ${Math.max(...own.map(s => s.ex)).toFixed(3)} m (${by(own)})` : ''}\n        by the groups the two halves sit in: ${(() => { const m = new Map(); for (const s of r.steps) m.set(s.groups, (m.get(s.groups) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') })()}\n        ${crease}`)
  for (const s of r.steps.slice(0, SHOW)) console.log(`          (${s.at.map(v => v.toFixed(1)).join(', ')}): ${s.ex.toFixed(3)} m · ${s.a} ↔ ${s.b} (${s.pair})${s.ink ? ' · ① ink' : ''}`)
  return 1
}

if (SELFTEST) {
  const dir = dirs[0], base = judge(dir), mut = judge(dir, true)
  if (base.refused) { console.log(`⛔ selftest: ${dir} cannot be judged — ${base.refused}`); process.exit(1) }
  const ok = mut.mutated && mut.steps.length > base.steps.length
  console.log(`${ok ? '✓' : '⛔'} selftest on ${base.town}: lifting one road half at ${mut.mutated} → steps ${base.steps.length} → ${mut.steps.length}${ok ? '' : ' — THE CHECK DID NOT SEE IT'}`)
  process.exit(ok ? 0 : 1)
}
let bad = 0
for (const d of dirs) bad += say(judge(d))
console.log(bad ? `⛔ ${bad} slab(s) whose road steps where its two halves meet, or that cannot be judged` : '✓ every slab\'s road meets itself across its centreline')
process.exit(bad ? 1 : 0)
