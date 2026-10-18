// claims-the-stripe-lies-on-its-road.mjs — DOES THE PAINTED STRIPE LIE ON THE ROAD IT IS PAINTED ON?
//
// ⭐ THE INVARIANT: a stripe is paint. It is cut into the carriageway's partition (`mat:stripe`), so its TERRAIN part
// (aRaw) must be the road's where it lies; its only intended departure is its LIFT — the baked y it keeps over the one
// ground plane (bake-ground.js `KEEP_OWN_SLOT`: the stripe keeps renderOrder × GROUND_Y_EPS while the road is flattened to
// y 0, so a residual overlap cannot z-fight). The lift is read off the slab (the stripe's y over the road's), never restated.
// ⭐ "THE ROAD BENEATH" is the nearest road triangle (`mat:asphalt` / `mat:highway`) to the point, read AT ITS NEAREST POINT
//   (never its plane extrapolated: a sliver's plane carried 5 cm runs off by hundreds of metres). The stripe has no asphalt
//   under it (the partition cut it out), and it is a few decimetres wide, so the road beside it is the road it is painted on.
// ⭐ SAMPLED WHERE A THIN TRIANGLE CANNOT HIDE IT: at every stripe vertex AND at every stripe edge's midpoint (a long, thin
//   stripe triangle is linear between its ends, so it does not bend with a road that does).
// ⭐ AT EVERY EXAGGERATION: drawn = aRaw × e + y. The departure is linear in e, so its worst over [0, E] (E the town's
//   ceiling) is at an end; both ends are judged.
// ⭐ THE GATE: the terrain part's departure |Δraw| × e > the lift — the stripe sinks under the road it is painted on, or
//   stands off it by more than its own lift again. Departures inside that are counted, not gated.
// ⛔ A slab with no baked terrain part on its road or stripe, no stripe, or a bake-ground.js with no GROUND_Y_EPS cannot be
//   judged: it fails, said so.
//
//   node checks/claims-the-stripe-lies-on-its-road.mjs [--town=a,b] [--dir=<slab dir>] [--show=n] [--selftest]
// Read-only. Exits 1 on any floating or sunk stripe sample, or on a slab that cannot be judged.
// --selftest: lifts one stripe vertex's terrain part, in memory, by four times its lift plus a metre: the check must then report a sample it
// did not report before.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../cartograph/terrainLoad.js'

const ROOT = new URL('../public/baked/', import.meta.url).pathname
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SHOW = +(arg('show') || 8)
const SELFTEST = process.argv.includes('--selftest')
const dirs = arg('dir') ? [arg('dir')] : (arg('town')?.split(',') || readdirSync(ROOT).filter(t => existsSync(join(ROOT, t, 'ground.json')))).map(t => arg('dir') ? t : join(ROOT, t))
const m = readFileSync(new URL('../cartograph/bake-ground.js', import.meta.url), 'utf8').match(/const GROUND_Y_EPS = (\d+(?:\.\d+)?)/)
const EPS = m ? +m[1] : null
const ROAD = /^(asphalt|highway)$/

function judge(dir, mutate = false) {
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), town = gj.look
  if (!town) return { town: dir, refused: 'the slab names no town (`look`)' }
  if (!(EPS > 0)) return { town, refused: 'bake-ground.js carries no GROUND_Y_EPS — the stacking slot is unknown' }
  const stripe = gj.groups.filter(g => g.kind === 'mat' && g.id === 'stripe'), road = gj.groups.filter(g => g.kind === 'mat' && ROAD.test(g.id))
  if (!stripe.length) return { town, refused: 'no mat:stripe group — nothing to judge' }
  if (!road.length) return { town, refused: 'no road group (mat:asphalt · mat:highway) for the stripe to lie on' }
  if ([...stripe, ...road].some(g => g.rawByteOffset == null)) return { town, refused: 'a stripe or road group carries no baked terrain part (aRaw): the 5 m texture path — re-bake the ground' }
  const E = loadSceneTerrain(town).exag
  if (!(E > 0)) return { town, refused: 'the town names no exaggeration' }
  const gb = readFileSync(join(dir, gj.bin || 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
  // the road's triangles as planes (raw and y separately: aRaw·e + y), gridded
  const CELL = 1, grid = new Map(), tris = []
  for (const g of road) { const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
    for (let k = 0; k < I.length; k += 3) { const v = [I[k], I[k + 1], I[k + 2]], xs = v.map(w => P[w * 3]), zs = v.map(w => P[w * 3 + 2])
      const id = tris.push({ xs, zs, r: v.map(w => R[w]), y: v.map(w => P[w * 3 + 1]), ro: g.renderOrder, g: g.id }) - 1
      for (let x = Math.floor(Math.min(...xs) / CELL); x <= Math.floor(Math.max(...xs) / CELL); x++) for (let z = Math.floor(Math.min(...zs) / CELL); z <= Math.floor(Math.max(...zs) / CELL); z++) { const key = x * 1000003 + z; (grid.get(key) || grid.set(key, []).get(key)).push(id) } } }
  const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0; return Math.hypot(x - ax - u * dx, z - az - u * dz) }
  // the nearest road triangle to (x, z), searched out to R cells, and its plane carried to the point
  const beneath = (x, z) => { let best = null, bd = Infinity; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL)
    for (let r = 0; r <= 2 && !best; r++) for (let ix = cx - r; ix <= cx + r; ix++) for (let iz = cz - r; iz <= cz + r; iz++) for (const id of grid.get(ix * 1000003 + iz) || []) { const t = tris[id], [x0, x1, x2] = t.xs, [z0, z1, z2] = t.zs
      const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2); if (d === 0) continue
      const a = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, b = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d, c = 1 - a - b
      const dist = a >= 0 && b >= 0 && c >= 0 ? 0 : Math.min(segD(x, z, x0, z0, x1, z1), segD(x, z, x1, z1, x2, z2), segD(x, z, x2, z2, x0, z0))
      if (dist < bd) { bd = dist
        // inside: the barycentric value; outside: the value at the nearest point of the nearest edge (never the plane extrapolated)
        let w = [a, b, c]
        if (dist > 0) { const E3 = [[0, 1], [1, 2], [2, 0]].map(([i, j]) => { const dx = t.xs[j] - t.xs[i], dz = t.zs[j] - t.zs[i], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((x - t.xs[i]) * dx + (z - t.zs[i]) * dz) / L2)) : 0
            return { i, j, u, d: Math.hypot(x - t.xs[i] - u * dx, z - t.zs[i] - u * dz) } }).sort((p, q) => p.d - q.d)[0]
          w = [0, 0, 0]; w[E3.i] = 1 - E3.u; w[E3.j] = E3.u }
        best = { raw: w[0] * t.r[0] + w[1] * t.r[1] + w[2] * t.r[2], y: w[0] * t.y[0] + w[1] * t.y[1] + w[2] * t.y[2], ro: t.ro, d: dist, g: t.g } } }
    return best }
  // ⭐ WHICH: a sample in the ① INK (the 2ε between two tiles' rings, held by no tile: the deformer reads the ink's owners
  // there, `groundDeformer.mjs#onInk`, not a tile's sweep), when the slab carries its shape.json
  const tiles = existsSync(join(dir, 'shape.json')) ? JSON.parse(readFileSync(join(dir, 'shape.json'), 'utf8')).tiles || [] : null
  const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
  const tb = tiles?.map(t => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of t.ring || []) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) } return [a, b, c, d] })
  const inInk = (x, z) => tiles ? !tiles.some((t, i) => t.ring?.length >= 3 && x >= tb[i][0] && x <= tb[i][2] && z >= tb[i][1] && z <= tb[i][3] && pip(x, z, t.ring)) : null
  const out = [], all = [], lifts = []
  let n = 0, mutated = null, noRoad = 0
  for (const g of stripe) { const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
    let R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
    if (mutate) { R = Float32Array.from(R); const v = g.vertexCount >> 1; R[v] += 4 * Math.max(...Array.from({ length: g.vertexCount }, (_, k) => P[k * 3 + 1])) / E + 1; mutated = `v${v} at (${P[v * 3].toFixed(1)}, ${P[v * 3 + 2].toFixed(1)})` }
    const samples = []
    for (let v = 0; v < g.vertexCount; v++) samples.push({ x: P[v * 3], z: P[v * 3 + 2], raw: R[v], y: P[v * 3 + 1], what: 'vertex' })
    const seen = new Set()
    for (let k = 0; k < I.length; k += 3) for (const [a, b] of [[I[k], I[k + 1]], [I[k + 1], I[k + 2]], [I[k + 2], I[k]]]) { const key = a < b ? `${a},${b}` : `${b},${a}`; if (seen.has(key)) continue; seen.add(key)
      samples.push({ x: (P[a * 3] + P[b * 3]) / 2, z: (P[a * 3 + 2] + P[b * 3 + 2]) / 2, raw: (R[a] + R[b]) / 2, y: (P[a * 3 + 1] + P[b * 3 + 1]) / 2, what: 'edge midpoint', L: Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 2] - P[b * 3 + 2]) }) }
    for (const s of samples) { const r = beneath(s.x, s.z); if (!r) { noRoad++; continue }
      n++
      const lift = s.y - r.y, dev = Math.abs(s.raw - r.raw) * E   // the terrain part's departure, worst at the ceiling
      const rec = { ...s, dev, intended: lift, sunk: (s.raw - r.raw) * E + lift < 0, under: r.g, d: r.d }; all.push(dev); lifts.push(lift)
      if (dev > Math.abs(lift)) { rec.ink = inInk(s.x, s.z); out.push(rec) } } }
  out.sort((a, b) => b.dev - a.dev); all.sort((a, b) => a - b)
  lifts.sort((a, b) => a - b)
  return { town, E, n, noRoad, out, all, mutated, lift: lifts.length ? lifts[lifts.length >> 1] : null }
}

const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))]
const say = (r) => {
  if (r.refused) { console.log(`  ⛔   ${r.town}: cannot be judged — ${r.refused}`); return 1 }
  const head = `${r.town}: ${r.n} stripe sample(s) (every vertex and edge midpoint) against the road beside them · the stripe's lift over it ${(r.lift * 1000).toFixed(0)} mm (its baked y, the bake's KEEP_OWN_SLOT; median) · exag ${r.E} · |terrain-part departure| p50 ${(q(r.all, 0.5) * 1000).toFixed(1)} mm · p99 ${(q(r.all, 0.99) * 1000).toFixed(1)} mm · max ${(r.all.at(-1) * 1000).toFixed(1)} mm${r.noRoad ? ` · ⚠️ ${r.noRoad} sample(s) with no road within 2 m, not judged` : ''}`
  if (!r.out.length) { console.log(`  ✓   ${head} · every sample within its slot`); return 0 }
  const v = r.out.filter(s => s.what === 'vertex').length
  console.log(`  ⛔   ${head}\n        ${r.out.length} sample(s) off the road by more than the stripe's own lift (${v} vertices · ${r.out.length - v} edge midpoints; ${r.out.filter(s => s.sunk).length} SUNK under it, ${r.out.filter(s => !s.sunk).length} standing off it), worst ${r.out[0].dev.toFixed(3)} m${r.out[0].ink != null ? ` · in the ① ink (no tile: its owners' lines) ${r.out.filter(s => s.ink).length}, inside a tile ${r.out.filter(s => !s.ink).length}` : ''} · > 20 cm ${r.out.filter(s => s.dev > 0.2).length} · > 50 cm ${r.out.filter(s => s.dev > 0.5).length}`)
  for (const s of r.out.slice(0, SHOW)) console.log(`          ${s.what}${s.L ? ` of a ${s.L.toFixed(2)} m edge` : ''} at (${s.x.toFixed(2)}, ${s.z.toFixed(2)}): ${s.dev.toFixed(3)} m ${s.sunk ? 'UNDER' : 'over'} ${s.under} (${s.d.toFixed(2)} m away), lift ${(s.intended * 1000).toFixed(0)} mm${s.ink ? ' · ① ink' : ''}`)
  return 1
}

if (SELFTEST) {
  const dir = dirs[0], base = judge(dir), mut = judge(dir, true)
  if (base.refused) { console.log(`⛔ selftest: ${dir} cannot be judged — ${base.refused}`); process.exit(1) }
  const ok = mut.out.length > base.out.length
  console.log(`${ok ? '✓' : '⛔'} selftest on ${base.town}: lifting stripe ${mut.mutated} by four lifts + 1 m → off the road ${base.out.length} → ${mut.out.length}${ok ? '' : ' — THE CHECK DID NOT SEE IT'}`)
  process.exit(ok ? 0 : 1)
}
let bad = 0
for (const d of dirs) bad += say(judge(d))
console.log(bad ? `⛔ ${bad} slab(s) whose stripe does not lie on its road, or that cannot be judged` : '✓ every slab\'s stripe lies on its road')
process.exit(bad ? 1 : 0)
