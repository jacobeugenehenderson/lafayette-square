// claims-the-horizon-takes-the-towns-cover.mjs — DOES THE HORIZON CARRY THE TOWN'S COVER, NEVER A ROAD?
//
// ⭐ THE INVARIANT: every sample point in ground.json's stencil `horizon` record (bake-ground, groundCover.mjs) lies on
// AREAL COVER — a land-use face or a landscape overlay — as the slab actually draws it (the topmost group there), and
// every direction the record names a cover for carries points on it.
// ⛔ WHY: HorizonDisc used to carry one colour-map sample per direction outward from just inside the rim; a road,
// stripe or water band crossing the rim became a radial streak to the horizon (Jacob, 2026-09-28, Lafayette Square).
// ⭐ It reads the slab's own triangles (ground.bin) and finds the topmost group itself — it does not re-use the bake's
// sampler, so it cannot agree with the bake's mistake. The cover predicate is the one definition (groundCover.mjs).
// ⭐ MUTATION (built in): a point moved onto a linear-feature triangle in the band must be flagged.
//
//   node checks/claims-the-horizon-takes-the-towns-cover.mjs            # every baked town
//   node checks/claims-the-horizon-takes-the-towns-cover.mjs --dir=<slab dir>
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isSoftCover } from '../cartograph/groundCover.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const dirArg = process.argv.find(a => a.startsWith('--dir='))?.slice(6)
const dirs = dirArg ? [dirArg] : readdirSync(join(ROOT, 'public', 'baked')).map(l => join(ROOT, 'public', 'baked', l)).filter(d => existsSync(join(d, 'ground.json')))
let failed = false, audited = 0, mutated = false

function audit(m, ab, horizon) {
  const [cx, cz] = m.stencil.center, rim = m.stencil.fade?.inner ?? m.stencil.radius
  const r0 = rim * horizon.band[0] - 10, r1 = rim * horizon.band[1] + 10, CELL = 20, grid = new Map(), tris = []
  for (const g of m.groups) {
    const P = new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(ab, g.indexByteOffset, g.indexCount)
    for (let t = 0; t < I.length; t += 3) {
      const v = [0, 1, 2].map(e => [P[I[t + e] * 3], P[I[t + e] * 3 + 2]]), d = v.map(q => Math.hypot(q[0] - cx, q[1] - cz))
      if (Math.max(...d) < r0 || Math.min(...d) > r1) continue
      const k = tris.push({ v, g }) - 1, xs = v.map(q => q[0]), zs = v.map(q => q[1])
      for (let a = Math.floor(Math.min(...xs) / CELL); a <= Math.floor(Math.max(...xs) / CELL); a++)
        for (let b = Math.floor(Math.min(...zs) / CELL); b <= Math.floor(Math.max(...zs) / CELL); b++) { const kk = a + ',' + b; (grid.get(kk) || grid.set(kk, []).get(kk)).push(k) }
    }
  }
  const topAt = (x, z) => {
    let best = null
    for (const k of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
      const [a, b, c] = tris[k].v, d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (!d) continue
      const w0 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, w1 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d
      if (w0 < -1e-6 || w1 < -1e-6 || w0 + w1 > 1 + 1e-6) continue
      if (!best || tris[k].g.renderOrder > best.renderOrder) best = tris[k].g
    }
    return best
  }
  const bad = []; let n = 0
  horizon.points.forEach((pts, s) => {
    if (horizon.cover[s] && !pts.length) bad.push(`direction ${s}: names cover ${horizon.cover[s]} but carries no points`)
    for (let i = 0; i < pts.length; i += 2) { n++; const g = topAt(pts[i], pts[i + 1])
      if (!isSoftCover(g)) bad.push(`direction ${s} point (${pts[i]}, ${pts[i + 1]}) lies on ${g ? g.kind + ':' + g.id : 'nothing'}`) }
  })
  const linear = tris.find(t => !isSoftCover(t.g) && !/water|bed/.test(t.g.id))
  return { bad, n, linear }
}

for (const dir of dirs) {
  const m = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), look = basename(dir)
  if (!m.stencil) continue
  if (!m.stencil.horizon) { console.log(`  ⛔ ${look.padEnd(18)} ground.json has a stencil but no horizon record — baked before it; ▶ node cartograph/bake-ground.js --look=${look} --scene=${look}`); failed = true; continue }
  const bin = readFileSync(join(dir, m.bin)), ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  const { bad, n, linear } = audit(m, ab, m.stencil.horizon)
  audited++
  const covered = m.stencil.horizon.cover.filter(Boolean).length
  console.log(`  ${bad.length ? '⛔' : '✅'} ${look.padEnd(16)} ${n} horizon points in ${covered}/${m.stencil.horizon.sectors} directions, ${bad.length} not on areal cover`)
  for (const b of bad.slice(0, 3)) console.log(`       ${b}`)
  if (bad.length) failed = true
  if (!mutated && linear && n) {
    mutated = true
    const [a, b, c] = linear.v, cxm = (a[0] + b[0] + c[0]) / 3, czm = (a[1] + b[1] + c[1]) / 3
    const mut = JSON.parse(JSON.stringify(m.stencil.horizon)), s = mut.points.findIndex(p => p.length)
    mut.points[s] = [+cxm.toFixed(3), +czm.toFixed(3), ...mut.points[s].slice(2)]
    const r = audit(m, ab, mut)
    if (r.bad.length <= bad.length) { console.log(`  ⛔ MUTATION SURVIVED: a point moved onto ${linear.g.id} in ${look} was not flagged`); failed = true }
    else console.log(`  ✅ mutation: a point moved onto ${linear.g.kind}:${linear.g.id} in ${look} is flagged`)
  }
}
console.log(`\n  ${audited} town(s) audited · cover = groundCover.mjs isSoftCover (land-use faces + landscape overlays)`)
if (failed) { console.log('\n⛔ the horizon is not carried from the town\'s cover alone'); process.exit(1) }
console.log('\n✅ every horizon point lies on the town\'s areal cover')
