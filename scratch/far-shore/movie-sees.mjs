// movie-sees.mjs — WHICH OF THE ARMOURED SHORE DOES THE MOVIE EVER SEE, AND WHEN FIRST? (brief §3.1 (d))
// Read-only. The pose set is heroAnim.js#heroPathPose over the town's baked scene.json heroKeyframes/heroMotion; the
// frustum test is bake-trees.js#classifyHeroTiers's (fov from the first key, 16:9, CULL_FRUSTUM_GUARD 1.3 — conservative:
// a sample counts as seen if it is ever inside the guard-expanded frustum, no far plane, no occlusion).
// Samples: every armoured face's spine every 10 m, radius 10 m, at y = 0 (the revetment stands on the water line).
// ▶ node scratch/far-shore/movie-sees.mjs --town=provincetown --slab=../integration/public/baked [--poses=400]
import { readFileSync } from 'node:fs'
import { heroPathPose, assertKeyframesAimed } from '../../src/preview/heroAnim.js'
import { revetmentFaces } from '../../src/lib/revetmentFromSlab.js'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const town = arg('town'), dir = `${arg('slab', 'public/baked')}/${town}`, N = +arg('poses', '400'), STEP = 10, R = 10
const scene = JSON.parse(readFileSync(`${dir}/scene.json`, 'utf8'))
const K = scene.heroKeyframes, M = scene.heroMotion
assertKeyframesAimed(K, 'movie-sees')
const cost = (() => { try { return Object.fromEntries(JSON.parse(readFileSync(arg('cost', ''), 'utf8')).faces.map(r => [r.key, r.ms + r.relMs])) } catch { return {} } })()
const vHalf = (K[0].fov * Math.PI / 180) / 2, hHalf = Math.atan(Math.tan(vHalf) * 16 / 9), G = 1.3
const poses = []
for (let s = 0; s < N; s++) { const { position: p, target: q } = heroPathPose(K, M, s / (N - 1)); poses.push([p.slice(), q.slice()]) }
const faces = revetmentFaces(JSON.parse(readFileSync(`${dir}/revetment.json`, 'utf8'))).filter(f => f.anyArmour)
let totM = 0, seenM = 0, firstM = 0
const rows = []
for (const f of faces) {
  // true arc-length sampling: the carry runs across segments, so a polyline of short segments is not over-counted
  const pts = []; let carry = 0
  for (let i = 1; i < f.poly.length; i++) { const a = f.poly[i - 1], b = f.poly[i], L = Math.hypot(b.x - a.x, b.z - a.z)
    let s = carry; for (; s < L; s += STEP) pts.push([a.x + (b.x - a.x) * s / L, a.z + (b.z - a.z) * s / L]); carry = s - L }
  let first = Infinity, seen = 0, atStart = 0
  for (const [x, z] of pts) {
    let fi = Infinity
    for (let k = 0; k < N && fi === Infinity; k++) { const [c, q] = poses[k]
      let fx = q[0] - c[0], fy = q[1] - c[1], fz = q[2] - c[2]; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl
      let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy
      const dx = x - c[0], dy = -c[1], dz = z - c[2], depth = dx * fx + dy * fy + dz * fz
      if (depth <= 0.01) continue
      const ah = Math.atan2(dx * rx + dz * rz, depth), av = Math.atan2(dx * ux + dy * uy + dz * uz, depth), ar = Math.atan2(R, Math.hypot(dx, dy, dz))
      if (Math.abs(ah) < hHalf * G + ar && Math.abs(av) < vHalf * G + ar) fi = k }
    if (fi < Infinity) { seen++; first = Math.min(first, fi); if (fi === 0) atStart++ }
  }
  totM += pts.length * STEP; seenM += seen * STEP; firstM += atStart * STEP
  rows.push({ key: f.key, m: pts.length * STEP, seenM: seen * STEP, atStartM: atStart * STEP, first: first === Infinity ? null : +(first / (N - 1)).toFixed(3), ms: cost[f.key] })
}
rows.sort((a, b) => b.m - a.m)
console.log(`${town}: ${K.length} keys, ${M?.mode ?? '?'} · ${faces.length} armoured faces, ${(totM / 1000).toFixed(1)} km of spine`)
console.log(`  seen by the movie at all: ${(seenM / 1000).toFixed(1)} km (${(100 * seenM / totM).toFixed(0)}%) · in the FIRST pose: ${(firstM / 1000).toFixed(1)} km (${(100 * firstM / totM).toFixed(0)}%)`)
const never = rows.filter(r => !r.seenM), msAll = rows.reduce((s, r) => s + (r.ms || 0), 0), msNever = never.reduce((s, r) => s + (r.ms || 0), 0)
console.log(`  faces never seen: ${never.length}/${rows.length}${msAll ? ` · their far build ${msNever.toFixed(0)} of ${msAll.toFixed(0)} ms (today's drape, no bare skip)` : ''}`)
for (const r of rows.slice(0, 10)) console.log(`  ${r.key.padEnd(9)} ${String(r.m).padStart(6)} m · seen ${String(r.seenM).padStart(6)} m · first at path ${r.first ?? 'never'}${r.ms != null ? ` · ${r.ms.toFixed(0)} ms` : ''}`)
