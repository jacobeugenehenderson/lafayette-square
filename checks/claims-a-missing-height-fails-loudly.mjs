#!/usr/bin/env node
// CLAIM — A HEIGHT THAT IS NOT THERE IS NEVER READ AS 0 (CLAUDE.md Layer 0 question 2: no fallbacks).
// A missing height read as 0 m is ground at the water datum (or at the local minimum): a plausible map, wrong.
// ASSERTS, by running the code (imported, never restated):
//   ① terrainCommon#makeElevationSampler REFUSES a field holding a non-finite node, or fewer values than
//     width × height. (It read either as 0 through `|| 0` on each of the four bilinear nodes.)
//   ② the sampler still reads a whole field as before: a node is its own value, a cell centre the mean of four.
//   ③ elevationSources#fillMisses REFUSES a grid with no valid node at all (its `: 0` arm set every miss to 0 m),
//     fills a grid with one valid node from that node, and leaves no NaN.
//   ④ every served and clean terrain.{json,bin} builds a sampler (so no town relied on the 0).
//   ⑤ terrainShader#reloadTerrain validates the fetched field (assertHeightfield) BEFORE it swaps it in: its sampler
//     rebuild runs inside a reload callback whose errors are caught and warned, so an invalid field refused only
//     there would leave the previous town's heights in place under the new town's name. (Read from the source:
//     the module cannot be imported in node, it reads import.meta.env.)
// ⚠️ NOT ASSERTED: terrainShader#fetchTerrain still renders a town FLAT when its terrain.json / terrain.bin is
//   missing. A town with no elevation input has no terrain by intake (serve.js hasElevationInput; F3,
//   checks/claims-a-flat-town-is-not-refined.mjs), and the 404 is the only way the player hears it. Making the miss
//   loud needs that state named in the slab first; that is a ruling, not this check's.
//
// ▶ MUTATION-TEST IT (seen RED before the fix; each put back):
//     · in terrainCommon makeElevationSampler, drop the `assertHeightfield(terrain)` call         → ① RED
//     · in elevationSources fillMisses, drop the `throw` for a grid with nothing to fill from       → ③ RED
//     · in terrainShader reloadTerrain, drop the `assertHeightfield(t, …)` call                     → ⑤ RED
//
//   node checks/claims-a-missing-height-fails-loudly.mjs
// Read-only. Exits 1 when a missing height can be read as a value.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { makeElevationSampler } from '../src/lib/terrainCommon.js'
import { fillMisses } from '../cartograph/elevationSources.mjs'

const ROOT = new URL('../', import.meta.url).pathname
let red = 0
const ok = (msg) => console.log(`   ✅ ${msg}`)
const bad = (msg) => { red++; console.log(`   ⛔ ${msg}`) }
const throws = (f) => { try { f(); return null } catch (e) { return e } }
const field = (w, h, fill) => ({ width: w, height: h, bounds: { minX: 0, maxX: w - 1, minZ: 0, maxZ: h - 1 }, data: Float32Array.from({ length: w * h }, fill) })

console.log('① the sampler refuses a field it cannot read')
{
  const f = field(4, 4, (_, k) => k); f.data[5] = NaN
  const e = throws(() => makeElevationSampler(f, 1).getElevationRaw(1, 1))
  e ? ok(`a NaN node refuses: ${e.message.slice(0, 100)}`) : bad(`a NaN node was read (getElevationRaw(1, 1) = ${makeElevationSampler(f, 1).getElevationRaw(1, 1)})`)
  const g = field(4, 4, (_, k) => k + 1); g.data = g.data.subarray(0, 12)
  const e2 = throws(() => makeElevationSampler(g, 1).getElevationRaw(3, 3))
  e2 ? ok(`12 values for a 4 × 4 field refuses: ${e2.message.slice(0, 100)}`) : bad(`12 values for a 4 × 4 field were read (getElevationRaw(3, 3) = ${makeElevationSampler(g, 1).getElevationRaw(3, 3)})`)
}
console.log('② the sampler reads a whole field as before')
{
  const f = field(5, 4, (_, k) => 0.25 * k + Math.sin(k)), S = makeElevationSampler(f, 2)
  let worst = 0
  for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) worst = Math.max(worst, Math.abs(S.getElevationRaw(i, j) - f.data[j * 5 + i]))
  const c = S.getElevationRaw(1.5, 2.5), m = (f.data[11] + f.data[12] + f.data[16] + f.data[17]) / 4
  worst < 1e-6 && Math.abs(c - m) < 1e-6 && Math.abs(S.getElevation(1.5, 2.5) - 2 * m) < 1e-6
    ? ok('every node reads its own value; a cell centre reads the mean of its four; getElevation = exag × raw')
    : bad(`node error ${worst} · centre ${c} vs ${m}`)
}
console.log('③ the miss fill refuses a grid with nothing to fill from')
{
  const all = new Float32Array(9).fill(NaN)
  const e = throws(() => fillMisses(all, 3, 3))
  e ? ok(`a grid of 9 misses refuses: ${e.message.slice(0, 100)}`) : bad(`a grid of 9 misses was filled: ${[...all].join(', ')}`)
  const one = new Float32Array(20).fill(NaN); one[13] = 7.25
  const e2 = throws(() => fillMisses(one, 5, 4))
  e2 ? bad(`a grid with one valid node refused: ${e2.message}`)
    : one.every(v => v === 7.25) ? ok('a grid with one valid node fills every miss from it') : bad(`a grid with one valid node filled to ${[...one].join(', ')}`)
}
console.log('④ every served and clean terrain builds a sampler')
for (const [kind, base] of [['served', 'public/baked/<t>'], ['clean', 'cartograph/data/<t>/clean']]) {
  const parent = join(ROOT, base.split('/<t>')[0])
  for (const t of readdirSync(parent).sort()) {
    const dir = join(ROOT, base.replace('<t>', t))
    if (!existsSync(join(dir, 'terrain.json')) || !existsSync(join(dir, 'terrain.bin'))) continue
    const tj = JSON.parse(readFileSync(join(dir, 'terrain.json'), 'utf8')), b = readFileSync(join(dir, 'terrain.bin'))
    const e = throws(() => makeElevationSampler({ ...tj, data: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) }, 1))
    e ? bad(`${kind} ${t}: ${e.message}`) : ok(`${kind} ${t}: ${tj.width} × ${tj.height}`)
  }
}
console.log('⑤ reloadTerrain validates before it swaps')
{
  const src = readFileSync(join(ROOT, 'src/utils/terrainShader.js'), 'utf8')
  const m = src.match(/export async function reloadTerrain\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)
  if (!m) bad('reloadTerrain not found in src/utils/terrainShader.js')
  else {
    const body = m[1], v = body.search(/assertHeightfield\(t\b/), sw = body.search(/_terrain = t\b/)
    v >= 0 && sw >= 0 && v < sw ? ok('assertHeightfield(t, …) runs before `_terrain = t`')
      : bad(v < 0 ? 'reloadTerrain swaps in the fetched field without assertHeightfield' : 'assertHeightfield runs after the swap')
  }
}
console.log('\n⚠️ NOT ASSERTED: fetchTerrain renders a town with no terrain.json FLAT (see the header — awaits a named "no terrain" state).')
console.log(red ? `\n⛔ ${red} way(s) a missing height reads as a value.` : '\n✅ A missing height refuses; a whole field reads as before.')
process.exit(red ? 1 : 0)
